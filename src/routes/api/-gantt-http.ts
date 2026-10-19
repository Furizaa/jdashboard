import { Effect, type ManagedRuntime } from 'effect'
import { match } from 'ts-pattern'
import { z } from 'zod'
import { createChartBody, toIssues, type GanttIssue } from '~/server/lib/gantt-schema'
import type { DuplicateEdgeId, GanttError } from '~/server/contexts/gantt/errors'
import { appRuntime } from '~/server/runtime/app-runtime'

// The plumbing every `/api/gantt/*` route shares: decoding a path parameter and
// a JSON body, the tagged-error → status map, and the `Response` constructors.
//
// The `-` prefix keeps this file out of TanStack's route discovery, which is the
// convention `routes/-app-shell.test.ts` and `-explain-stream.test.ts` already
// use. It imports neither `server/wire/` nor `server/server-functions/`: this
// layer returns raw HTTP and the application service is where the two consumers
// meet (ADR-0006, ADR-0012 §7), and `pnpm depcruise` says so if it drifts.
//
// **Error bodies here are JSON, and that is a deliberate departure from
// ADR-0006.** That ADR mandates plain text and gives a consumer-specific reason:
// "the browser's `<img onerror>` / `<video onerror>` does not inspect the body".
// This consumer is an agent that has to **self-correct from the error**, and
// `explain-skill.test.ts` records what the alternative costs — a twenty-minute
// run rejected at the boundary with a message nothing could key off. So the
// body shape follows the consumer (ADR-0012 §9): plain text for browsers, JSON
// for programmatic clients. A reader of ADR-0006 arriving here has not found a
// mistake; they have found the sentence that ADR amended.

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const
const MARKDOWN_HEADERS = { 'Content-Type': 'text/markdown; charset=utf-8' } as const

/**
 * The one error shape. `issues` is always present, even empty: one shape is
 * worth more to a programmatic consumer than a key it has to test for.
 */
export type GanttErrorBody = {
  readonly error: string
  readonly message: string
  readonly issues: readonly GanttIssue[]
}

export function ganttJson(value: unknown, status: number): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
}

/** A node's body is markdown, so it goes back as markdown rather than wrapped. */
export function ganttMarkdown(markdown: string): Response {
  return new Response(markdown, { status: 200, headers: MARKDOWN_HEADERS })
}

export function ganttErrorResponse(
  status: number,
  error: string,
  message: string,
  issues: readonly GanttIssue[] = [],
): Response {
  return ganttJson({ error, message, issues } satisfies GanttErrorBody, status)
}

const badRequest = (message: string, issues: readonly GanttIssue[]): Response =>
  ganttErrorResponse(400, 'InvalidChartPayload', message, issues)

// ---------------------------------------------------------------------------
// Decoding
// ---------------------------------------------------------------------------

/** Either the decoded value, or the `Response` the route should return instead. */
export type Decoded<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly response: Response }

// The slug rule, taken from the create body rather than copied. `assertChartId`
// is the other guard over the same charset, and it *throws* — rightly, because it
// guards a filesystem path, where an unguarded id is a programming error — so a
// route that wants a `400` instead parses rather than asserts. One pattern, two
// jobs (ADR-0012 §8: the slug charset *is* the path guard).
const slugId = createChartBody.shape.id

export const chartParams = z.object({ chartId: slugId })
export const nodeParams = z.object({ chartId: slugId, nodeId: slugId })
export const edgeParams = z.object({ chartId: slugId, edgeId: slugId })

/**
 * Every decode in this layer passes `{ reportInput: true }`. Zod v4 strips the
 * offending value from its issues by default, and `toIssues` then falls back to
 * the literal `'unknown'` — honest, and useless to an agent trying to see what
 * it sent. `received` is the half of the error that makes it correctable.
 */
export function decodeParams<S extends z.ZodType>(
  schema: S,
  params: unknown,
): Decoded<z.output<S>> {
  const result = schema.safeParse(params, { reportInput: true })
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        response: badRequest('the URL names an id that is not a slug', toIssues(result.error)),
      }
}

export async function decodeJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<Decoded<z.output<S>>> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return {
      ok: false,
      response: badRequest('the request body is not valid JSON', [
        { path: '(root)', expected: 'a JSON object', received: 'unparseable' },
      ]),
    }
  }
  const result = schema.safeParse(raw, { reportInput: true })
  return result.success
    ? { ok: true, value: result.data }
    : {
        ok: false,
        response: badRequest('the request body does not match the schema', toIssues(result.error)),
      }
}

// ---------------------------------------------------------------------------
// Failure mapping
// ---------------------------------------------------------------------------

/**
 * `DuplicateEdgeId` is **one tag over two refusals**, and the message is what
 * separates them: `edgeId` is the incumbent edge's id either way, so an agent
 * reading only "already has an edge" could not tell a name collision it should
 * rename past from a dependency it has already declared and must stop
 * re-declaring. A pair collision names the pair; an id collision does not.
 */
function duplicateEdgeMessage(error: DuplicateEdgeId): string {
  const { chartId, edgeId, pair } = error
  if (pair === undefined) return `chart "${chartId}" already has an edge "${edgeId}"`
  return (
    `chart "${chartId}" already has edge "${edgeId}" declaring that "${pair.from}" blocks ` +
    `"${pair.to}" — a dependency is identified by its endpoint pair, not by its id, so there ` +
    `is nothing to add under another id`
  )
}

/**
 * One tag, one status, one message — exhaustive over `GanttError`, so adding a
 * failure to the application service is a compile error here rather than a
 * silent `500` at the one place the agent is reading.
 *
 * `503` is `JiraUnreachable`, and it is the one arm here that is not the
 * caller's fault: sync could not read the mirrored half, the chart was left
 * exactly as it was, and trying again later is the whole remedy.
 */
export function ganttFailureResponse(error: GanttError): Response {
  return match(error)
    .with({ _tag: 'InvalidChartPayload' }, (e) =>
      ganttErrorResponse(400, 'InvalidChartPayload', e.message, e.issues),
    )
    .with({ _tag: 'ChartNotFound' }, (e) =>
      ganttErrorResponse(404, 'ChartNotFound', `there is no chart "${e.chartId}"`),
    )
    .with({ _tag: 'NodeNotFound' }, (e) =>
      ganttErrorResponse(404, 'NodeNotFound', `chart "${e.chartId}" has no node "${e.nodeId}"`),
    )
    .with({ _tag: 'EdgeNotFound' }, (e) =>
      ganttErrorResponse(404, 'EdgeNotFound', `chart "${e.chartId}" has no edge "${e.edgeId}"`),
    )
    .with({ _tag: 'DuplicateChartId' }, (e) =>
      ganttErrorResponse(
        409,
        'DuplicateChartId',
        `a chart with the id "${e.chartId}" already exists`,
      ),
    )
    .with({ _tag: 'DuplicateNodeId' }, (e) =>
      ganttErrorResponse(
        409,
        'DuplicateNodeId',
        `chart "${e.chartId}" already has a node "${e.nodeId}"`,
      ),
    )
    .with({ _tag: 'DuplicateEdgeId' }, (e) =>
      ganttErrorResponse(409, 'DuplicateEdgeId', duplicateEdgeMessage(e)),
    )
    .with({ _tag: 'JiraUnreachable' }, (e) =>
      ganttErrorResponse(
        503,
        'JiraUnreachable',
        `${e.message}, so chart "${e.chartId}" was left exactly as it was`,
      ),
    )
    .with({ _tag: 'MirroredFieldPatch' }, (e) =>
      ganttErrorResponse(
        422,
        'MirroredFieldPatch',
        `node "${e.nodeId}" is mirrored from Jira, so the next sync would overwrite ${e.fields.join(', ')}`,
        e.fields.map((field) => ({
          path: field,
          expected: 'a field the chart owns (parentId, order, start, end)',
          received: 'a field Jira owns on this node',
        })),
      ),
    )
    .exhaustive()
}

/** A defect is a bug, not something the caller sent. Logged, then `500`. */
export function ganttDefectResponse(route: string, defect: unknown): Response {
  console.error(`[api/gantt] Unhandled defect in ${route}:`, defect)
  return ganttErrorResponse(500, 'InternalError', 'the server failed to complete the write')
}

/**
 * What `appRuntime` can satisfy. Sync needs `JiraGateway` in its `R` channel, so
 * the helper takes any program the one process-scoped runtime can run rather
 * than only the `R = never` ones the pure-disk writes produce. Spelled exactly
 * as `server-functions/run-wire.ts` spells it, for the same reason.
 */
type AppContext = ManagedRuntime.ManagedRuntime.Context<typeof appRuntime>

/**
 * Run one application-service program and turn it into a `Response`: the success
 * shape the route chooses, the status map above for a tagged failure, and a
 * logged `500` for a defect — the same three arms `jira-media.$id.ts` has.
 */
export function ganttRespond<A, E extends GanttError, R extends AppContext>(
  route: string,
  program: Effect.Effect<A, E, R>,
  onSuccess: (value: A) => Response,
): Promise<Response> {
  return appRuntime.runPromise(
    program.pipe(
      Effect.match({ onSuccess, onFailure: ganttFailureResponse }),
      Effect.catchAllDefect((defect) => Effect.sync(() => ganttDefectResponse(route, defect))),
    ),
  )
}

/** The params shapes the route handlers declare, named so the files stay thin. */
export type ChartCtx = { readonly params: { readonly chartId: string } }
export type NodeCtx = { readonly params: { readonly chartId: string; readonly nodeId: string } }
export type EdgeCtx = { readonly params: { readonly chartId: string; readonly edgeId: string } }
export type WithRequest = { readonly request: Request }
