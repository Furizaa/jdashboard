// The Gantt chart contract: the one place a chart stops being JSON — on the wire
// from an agent, or on disk under `~/.clashboard/gantt/` — and becomes a typed
// domain object.
//
// A chart is stored **flat with `parentId`** and presented as a tree. Depth is
// unbounded, which is a statement about the domain rather than about the JSON:
// `domain/tree.ts` builds the tree and the store never sees one. Node-level
// `PATCH` over nested children would be path-addressed tree surgery on every
// write, and reparenting would be a move rather than a field.
//
// Two shapes are validated here. The **stored chart** (`ganttChartSchema`) is
// everything, including the fields only the server writes — a file on disk is as
// untrusted an input as an agent reply, so it is validated on the way in as well
// as out. The **request bodies** (`createChartBody` and friends) are narrower:
// an agent cannot set `version` or `createdAt`, and cannot mark a node
// `orphaned`, because those are facts the server observes rather than opinions a
// caller holds. `hasBody` is in neither — it is derived at read time from the
// presence of `bodies/<id>.md` (ADR-0012 §11), because a stored flag would be a
// second source of truth for a file's existence.
//
// Zod (not `effect/Schema`) because this shape crosses to the client: the
// per-repo rule is one validator per side of the boundary, and the
// client-facing schemas are Zod (CONTEXT-MAP, "Schema (client-crossing)").
import { z } from 'zod'
import { COLUMNS } from '~/kernel/columns'

/**
 * Bumped on a breaking change to the chart's shape. A chart naming any other
 * version is rejected rather than best-effort rendered — and unlike an Explain
 * report a chart is **not** regenerable, so a bump needs a migration over
 * `~/.clashboard/gantt/`, not a shrug.
 */
export const GANTT_CHART_VERSION = 1

/**
 * Chart and node ids are agent-supplied slugs (ADR-0012 §8): lowercase, digits
 * and hyphens, starting with an alphanumeric, at most 64 characters. A chart id
 * is also its folder name and a node id its body's filename, so this charset is
 * the **path guard** the store depends on — see `assertChartId`. Opaque
 * server-generated ids were rejected: every agent turn would carry a map of ids
 * it cannot reconstruct, a transposed id would silently target the wrong node,
 * and `bodies/n_7f3a91.md` is not a file anyone can read.
 */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/u

/**
 * `YYYY-MM-DD`, month and day range-checked — a regex-guarded string and not
 * `z.date()`, because both the wire and the file are JSON and a `Date` would only
 * survive either as the string this already is. The range check makes
 * `2026-13-01` an error an agent can correct rather than a bar in the wrong year.
 *
 * Dates are chart-owned and nullable on every node (ADR-0012 §4): import creates
 * one node per discovered ticket with no dates at all, and requiring them would
 * mean fabricating a plan nobody made.
 */
const DATE_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u

const slug = z.string().regex(SLUG_PATTERN, 'must be a lowercase hyphenated slug of 1-64 chars')
const line = z.string().trim().min(1).max(300)
const ganttDate = z.string().regex(DATE_PATTERN, 'must be a YYYY-MM-DD date')
/** An ISO-8601 instant, as `toISOString()` writes it. Only the server sets these. */
const instant = z.iso.datetime()

// ---------------------------------------------------------------------------
// Nodes and edges
// ---------------------------------------------------------------------------

/**
 * Source is a property of the node, not of the chart (ADR-0012 §3): the
 * arrangement the feature exists for is precisely the mixture — existing tickets
 * grouped under an agent-written PRD lane.
 *
 * Sharper still, source names who owns which **field**. A `jira` node's `title`,
 * `column`, `status` and `assignee` are mirrored — sync overwrites them. Its
 * `start`, `end`, `parentId`, edges and body are chart-owned, and sync never
 * touches them. See `MIRRORED_NODE_FIELDS`.
 */
const ganttNodeSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jira'), key: line }),
  z.object({ kind: z.literal('local') }),
])

/**
 * An edge carries its own source for the same reason a node does (ADR-0012 §6):
 * Jira's link hygiene is worse than its date hygiene. A **local** edge between
 * two Jira tickets is the common and important case, which is why ownership is a
 * field rather than something derived from the endpoints.
 */
const ganttEdgeSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('jira'), linkId: line }),
  z.object({ kind: z.literal('local') }),
])

/**
 * Progress is the kernel `Column`, not a second vocabulary and not a percent
 * (ADR-0012 §4): `columnForStatus(status)` for a jira node, declared for a local
 * one. `blocked` is absent — derived from the edge graph, so it cannot go stale
 * when the blocker ships.
 */
const columnSchema = z.enum(COLUMNS)

const ganttNodeSchema = z.object({
  /** Unique within the chart; also the name of its body file. */
  id: slug,
  /** `null` for a root lane. Chart-owned: sync places a node once and never moves it. */
  parentId: slug.nullable(),
  /** Sibling ordering. Chart-owned. */
  order: z.number().int(),
  /** Mirrored when `source.kind === 'jira'`. */
  title: line,
  source: ganttNodeSourceSchema,
  start: ganttDate.nullable(),
  end: ganttDate.nullable(),
  /** Mirrored (`columnForStatus`) when jira. */
  column: columnSchema,
  /** Mirrored; the real HDR status name, which is not the column's name. */
  status: line.nullable(),
  /** Mirrored. */
  assignee: line.nullable(),
  /**
   * Set by sync when the key left the epic. A departed ticket is **marked, not
   * removed** (ADR-0012 §5): it carries local children, a body, declared edges
   * and hand-set dates, all of which deleting it would destroy silently.
   */
  orphaned: z.boolean(),
})

const ganttEdgeSchema = z.object({
  id: slug,
  /** Node id. Every edge means `from` blocks `to`; there is no `kind` to pick. */
  from: slug,
  to: slug,
  source: ganttEdgeSourceSchema,
})

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

export const ganttChartSchema = z
  .object({
    version: z.literal(GANTT_CHART_VERSION),
    /** Slug, and the folder name under `~/.clashboard/gantt/`. */
    id: slug,
    title: line,
    /**
     * Epic keys, not a JQL string (ADR-0012 §5): the server builds
     * `parent in (...)` itself so the SKILL teaches a string array rather than a
     * query language. The key *shape* is enforced where the JQL is built, with
     * `assertIssueKey`, so this module keeps no second copy of that pattern.
     */
    jiraSources: z.array(line),
    lastSyncedAt: instant.nullable(),
    createdAt: instant,
    nodes: z.array(ganttNodeSchema),
    edges: z.array(ganttEdgeSchema),
  })
  // Three chart-level invariants no field schema can see, all about an id being
  // a *handle*: a duplicate node id makes `PATCH /nodes/:nodeId` ambiguous, a
  // duplicate edge id makes `DELETE /edges/:edgeId` ambiguous, and an edge
  // pointing at a node that is not there is an arrow the layout cannot draw. A
  // cycle is **not** checked, deliberately: the API never refuses to record a
  // declared dependency — the layout names the loop (ADR-0012 §6).
  .superRefine((chart, ctx) => {
    const nodeIds = new Set<string>()
    for (const [index, node] of chart.nodes.entries()) {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['nodes', index, 'id'],
          message: `duplicate node id "${node.id}"`,
        })
      }
      nodeIds.add(node.id)
    }

    const edgeIds = new Set<string>()
    for (const [index, edge] of chart.edges.entries()) {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edges', index, 'id'],
          message: `duplicate edge id "${edge.id}"`,
        })
      }
      edgeIds.add(edge.id)
      for (const end of ['from', 'to'] as const) {
        if (!nodeIds.has(edge[end])) {
          ctx.addIssue({
            code: 'custom',
            path: ['edges', index, end],
            message: `edge ${end} "${edge[end]}" is not a node in this chart`,
          })
        }
      }
    }
  })

export type GanttNodeSource = z.infer<typeof ganttNodeSourceSchema>
export type GanttEdgeSource = z.infer<typeof ganttEdgeSourceSchema>
export type GanttNode = z.infer<typeof ganttNodeSchema>
export type GanttEdge = z.infer<typeof ganttEdgeSchema>
export type GanttChart = z.infer<typeof ganttChartSchema>

// ---------------------------------------------------------------------------
// Path guards
// ---------------------------------------------------------------------------

/**
 * A chart id is a folder name and a node id is a filename, so neither may reach
 * the filesystem unchecked. These throw in the shape `assertIssueKey` in `jql.ts`
 * establishes — a `label` naming the call site, the offending value quoted —
 * because the only way to reach one is a programming error or a route that
 * forgot to decode its parameter, and both want a stack rather than a `null`.
 *
 * The slug charset doubling as the path guard is the point ADR-0012 §8 makes:
 * `../escape` is not a slug, so the guard and the id format are one rule rather
 * than two that can drift.
 */
export function assertChartId(value: string, label: string): string {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(`${label}: invalid chart id "${value}"`)
  }
  return value
}

export function assertNodeId(value: string, label: string): string {
  if (!SLUG_PATTERN.test(value)) {
    throw new Error(`${label}: invalid node id "${value}"`)
  }
  return value
}

// ---------------------------------------------------------------------------
// The structured error payload
// ---------------------------------------------------------------------------

/** One field the caller got wrong, in the shape ADR-0012 §9 specifies. */
export type GanttIssue = {
  readonly path: string
  readonly expected: string
  readonly received: string
}

/** The path of an issue at the very root of the decoded value. */
const ROOT_PATH = '(root)'
/** `received` is truncated at this length: it is an error body, not a dump. */
const MAX_RECEIVED_LENGTH = 40

function describeReceived(input: unknown): string {
  if (input === null) return 'null'
  // An object or an array is named rather than serialised: the caller sent it,
  // and the path already says which one it was.
  if (typeof input === 'object') return Array.isArray(input) ? 'array' : 'object'
  if (typeof input !== 'string') return String(input)
  const quoted = JSON.stringify(input)
  return quoted.length > MAX_RECEIVED_LENGTH ? `${quoted.slice(0, MAX_RECEIVED_LENGTH)}…"` : quoted
}

function describeExpected(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type':
      return issue.expected
    case 'invalid_value':
      return issue.values.map((value) => JSON.stringify(value)).join(' | ')
    case 'invalid_format':
      return issue.format === 'regex' ? `string matching ${issue.pattern ?? ''}` : issue.format
    case 'too_big':
      return `${issue.origin} of at most ${issue.maximum}`
    case 'too_small':
      return `${issue.origin} of at least ${issue.minimum}`
    case 'unrecognized_keys':
      return `no unrecognized key (${issue.keys.join(', ')})`
    default:
      // `custom`, `invalid_union`, `invalid_key`, `invalid_element`,
      // `not_multiple_of` — the message is the only field common to all of them
      // and, for a `superRefine`, the only field that says anything useful.
      return issue.message
  }
}

/**
 * A decode failure → the `issues[]` an agent can self-correct from (ADR-0012
 * §9). `path` is dot-joined (`nodes.2.start`) because that is how the field is
 * addressed in the body the agent just sent. This exists because the alternative
 * is a rejected run: `explain-skill.test.ts` records what that costs — "rejected
 * at the boundary with `moves.1.blocks.1.mermaid: expected string, received
 * undefined`" — which is exactly this payload, except as a sentence a caller
 * cannot key off.
 *
 * **Parse with `{ reportInput: true }`** to get a concrete `received`. Zod strips
 * the offending value from its issues by default; without it every `received`
 * reads `unknown`, which is honest but much less useful.
 */
export function toIssues(error: z.ZodError): ReadonlyArray<GanttIssue> {
  return error.issues.map((issue) => ({
    path: issue.path.length === 0 ? ROOT_PATH : issue.path.join('.'),
    expected: describeExpected(issue),
    received: 'input' in issue ? describeReceived(issue.input) : 'unknown',
  }))
}

// ---------------------------------------------------------------------------
// Request bodies — the write surface's half of the contract
// ---------------------------------------------------------------------------

/**
 * The fields sync owns on a jira node. A `PATCH` that names one of these on a
 * node whose `source.kind` is `'jira'` must be refused: the next sync would
 * overwrite it, so accepting the write would be a lie. Only half of that rule is
 * expressible in a body schema — *which* fields are mirrored. The other half
 * depends on the **target node's** source, which the body does not carry and the
 * schema cannot look up.
 *
 * TODO(93): the application service in `server/contexts/gantt/application/`
 * loads the node, and rejects a patch where `source.kind === 'jira'` and
 * `patchTouchesMirroredFields(body)` is true.
 */
export const MIRRORED_NODE_FIELDS = ['title', 'column', 'status', 'assignee'] as const

/** Whether a decoded node patch names any field sync owns. See the TODO above. */
export function patchTouchesMirroredFields(body: PatchNodeBody): boolean {
  return MIRRORED_NODE_FIELDS.some((field) => body[field] !== undefined)
}

/**
 * `POST /api/gantt/charts`. The server supplies `version`, `createdAt`,
 * `lastSyncedAt` and — when `jiraSources` is non-empty — one mirrored node per
 * discovered ticket, flat and undated (ADR-0012 §5). What is left for the agent
 * is the arrangement, which is the part that needs judgement.
 */
export const createChartBody = z.object({
  id: slug,
  title: line,
  jiraSources: z.array(line).default([]),
})

/**
 * `PATCH /api/gantt/charts/:chartId`. `id`, `version` and `createdAt` are
 * identity and history, so none is patchable; `nodes` and `edges` are reached
 * through their own endpoints, because a whole-chart write would make every
 * concurrent edit a conflict (ADR-0012 §8).
 */
export const patchChartBody = z.object({
  title: line.optional(),
  jiraSources: z.array(line).optional(),
})

/**
 * `POST /api/gantt/charts/:chartId/nodes`. `orphaned` is absent on purpose: a
 * fact sync observes about a Jira key, not a claim a caller gets to make.
 */
export const createNodeBody = z.object({
  id: slug,
  parentId: slug.nullable().default(null),
  order: z.number().int().default(0),
  title: line,
  source: ganttNodeSourceSchema.default({ kind: 'local' }),
  start: ganttDate.nullable().default(null),
  end: ganttDate.nullable().default(null),
  column: columnSchema.default('TO DO'),
  status: line.nullable().default(null),
  assignee: line.nullable().default(null),
})

/**
 * `PATCH /api/gantt/charts/:chartId/nodes/:nodeId`. `id` is the URL's handle on
 * the node and `source` decides which half of it sync owns — changing either
 * would be a different node, so both are absent rather than optional.
 */
export const patchNodeBody = z.object({
  parentId: slug.nullable().optional(),
  order: z.number().int().optional(),
  title: line.optional(),
  start: ganttDate.nullable().optional(),
  end: ganttDate.nullable().optional(),
  column: columnSchema.optional(),
  status: line.nullable().optional(),
  assignee: line.nullable().optional(),
})

/**
 * `POST /api/gantt/charts/:chartId/edges`. Defaults to a local edge: the one an
 * agent declares is by definition the one Jira does not have.
 */
export const createEdgeBody = z.object({
  id: slug,
  from: slug,
  to: slug,
  source: ganttEdgeSourceSchema.default({ kind: 'local' }),
})

export type CreateChartBody = z.infer<typeof createChartBody>
export type PatchChartBody = z.infer<typeof patchChartBody>
export type CreateNodeBody = z.infer<typeof createNodeBody>
export type PatchNodeBody = z.infer<typeof patchNodeBody>
export type CreateEdgeBody = z.infer<typeof createEdgeBody>
