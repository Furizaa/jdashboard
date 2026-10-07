// The Explain report contract: the one place the agent's output stops being
// text and becomes a typed domain object.
//
// The agent returns a **chaptered document** (ADR-0010):
//
//     { version: 2, overview: Block[], moves: Move[] }
//
// A **move** is one logical change running through the merge request — something
// the author did on purpose, with files under it — and it is both a rail entry
// and a notebook page. `overview` is everything that is about the merge request
// rather than about one move: the verdict, the systems table, the blast radius,
// the questions, the unverified list.
//
// The grouping is the one piece of analysis a diff viewer structurally cannot
// do, and making it a **required field** rather than something the prose might
// happen to do is what keeps a report from being a wall of text.
//
// `Block` is a discriminated union, unchanged from v1 except for the new `diff`
// cell. Two consequences are the whole point:
//
//   - **Validated once, at the server boundary.** Zod runs here, before the
//     report is persisted or streamed, so a malformed reply becomes a tagged
//     error that keeps the raw text for debugging rather than a half-rendered
//     tab.
//   - **Matched exhaustively in the view.** `renderBlock` matches this union
//     with `ts-pattern.exhaustive()`, so adding a block type is a compile error
//     until it has a renderer — the invariant ADF rendering already relies on.
//     Blocks are the *cell* vocabulary; what v2 changed is only where a list of
//     them can appear (the overview has one, and so does every move).
//
// The schema is **architect-altitude by construction**. There is no `nit`
// severity to select, and a `finding` cannot be expressed without naming the
// `system` it concerns and a `whyItMatters`. A schema that cannot represent a
// line-length complaint is a cheaper and more durable instruction than a prompt
// asking the agent not to make one.
//
// Zod (not `effect/Schema`) because this shape crosses to the client: the
// per-repo rule is one validator per side of the boundary, and the client-facing
// schemas are Zod (CONTEXT-MAP, "Schema (client-crossing)").
import { z } from 'zod'
import { firstJsonObject } from './claude-cli'
import { explainBlockSchema, line, prose } from './explain-blocks'

/**
 * Bumped on a breaking change to the report's shape. A report that names any
 * other version is rejected rather than best-effort rendered — and deliberately
 * without a migration shim (ADR-0010 §4): a report is a regenerable artifact
 * whose whole cost is one agent run, so a v1 record on disk reads as absent,
 * which the tab already renders as `interrupted — re-run`.
 */
export const EXPLAIN_REPORT_VERSION = 2

// ---------------------------------------------------------------------------
// Moves — the chapters
// ---------------------------------------------------------------------------

/**
 * A slug, lowercase and hyphenated: it goes in the URL (`?move=`), so it has to
 * survive being typed, pasted and shared. An **index** would have been easier to
 * produce and is exactly wrong — a re-run would silently repoint every link at a
 * different move.
 */
const MOVE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u

/**
 * And it must contain a letter. Digits belong in a slug (`adr-0010-follow-up`),
 * but an id made only of them is an index wearing a slug's clothes — the one
 * thing the id is defined in opposition to.
 */
const MOVE_ID_HAS_LETTER = /[a-z]/u

/**
 * One logical change: something the author did on purpose, with files under it.
 *
 * The required fields are the altitude rule, the same way `finding` requires a
 * `system` and a `whyItMatters` (ADR-0009 §7). The rail is what the reader
 * scans, so a move that can only state a title is a table of contents; a move
 * that cannot name a system it touches is a file list; a move with no `paths` is
 * not a move. There is deliberately **no severity field** — a move's attention
 * level is the worst severity among its own findings, rolled up in the domain,
 * because an agent-stated severity beside the findings it comes from would be a
 * second source of truth for one fact.
 */
const explainMoveSchema = z.object({
  /** Unique within the report; `?move=` names it. */
  id: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(MOVE_ID, 'must be a lowercase hyphenated slug')
    .refine((id) => MOVE_ID_HAS_LETTER.test(id), 'must contain a letter, not only digits'),
  /** What was done, as a statement: "Rounding leaves the pricing service". */
  title: line,
  /** One line for the rail — the *why*, not a restatement of the title. */
  summary: prose,
  /** The systems this move touches. The rail's chips. */
  systems: z.array(line).min(1),
  /** The files it spans. What the whole-diff expander matches against. */
  paths: z.array(line).min(1),
  /** The notebook page: narrative, diff and diagram cells, then its findings. */
  blocks: z.array(explainBlockSchema).min(1),
})

export const explainReportSchema = z
  .object({
    version: z.literal(EXPLAIN_REPORT_VERSION),
    /** Whole-MR: the verdict, the systems table, blast radius, questions, unverified. */
    overview: z.array(explainBlockSchema).min(1),
    /** The logical changes, in the agent's own reading order. Never re-sorted. */
    moves: z.array(explainMoveSchema).min(1),
  })
  // A report with two moves claiming one id is malformed, not a rendering
  // problem: the id is the URL's handle on a page, so the view cannot be left to
  // pick between them.
  .superRefine((report, ctx) => {
    const seen = new Set<string>()
    for (const [index, move] of report.moves.entries()) {
      if (seen.has(move.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['moves', index, 'id'],
          message: `duplicate move id "${move.id}"`,
        })
      }
      seen.add(move.id)
    }
  })

export type ExplainMove = z.infer<typeof explainMoveSchema>
export type ExplainReport = z.infer<typeof explainReportSchema>

/**
 * Tagged, like every other agent parse in the app. The failure keeps the raw
 * reply: a report that does not validate is a prompt or CLI problem, and the
 * text is the only evidence of which.
 */
export type ExplainReportParse =
  | { readonly ok: true; readonly report: ExplainReport }
  | { readonly ok: false; readonly error: { readonly message: string; readonly raw: string } }

function fail(message: string, raw: string): ExplainReportParse {
  return { ok: false, error: { message, raw } }
}

// Zod's own issue text is accurate but long. One line per issue, path-prefixed,
// capped — enough to see which block is wrong without pasting a stack into a toast.
const MAX_REPORTED_ISSUES = 5

function describeIssues(error: z.ZodError): string {
  const issues = error.issues.slice(0, MAX_REPORTED_ISSUES).map((issue) => {
    const path = issue.path.length === 0 ? 'report' : issue.path.join('.')
    return `${path}: ${issue.message}`
  })
  const extra = error.issues.length - issues.length
  return issues.join('; ') + (extra > 0 ? `; (+${extra} more)` : '')
}

/**
 * The agent's final reply text → a validated report. Tolerates prose or a
 * ```json fence around the object (the agent is told to return only JSON, and
 * mostly does), and treats a truncated reply as "no report" rather than
 * half-parsing it.
 */
export function parseExplainReport(reply: string): ExplainReportParse {
  const objectText = firstJsonObject(reply)
  if (objectText === null) return fail('the explain agent did not return a report object', reply)

  let parsed: unknown
  try {
    parsed = JSON.parse(objectText)
  } catch {
    return fail('the explain agent returned a malformed report object', reply)
  }

  const result = explainReportSchema.safeParse(parsed)
  if (!result.success) {
    return fail(
      `the explain report did not match the contract — ${describeIssues(result.error)}`,
      reply,
    )
  }
  return { ok: true, report: result.data }
}
