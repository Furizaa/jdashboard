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

/**
 * Bumped on a breaking change to the report's shape. A report that names any
 * other version is rejected rather than best-effort rendered — and deliberately
 * without a migration shim (ADR-0010 §4): a report is a regenerable artifact
 * whose whole cost is one agent run, so a v1 record on disk reads as absent,
 * which the tab already renders as `interrupted — re-run`.
 */
export const EXPLAIN_REPORT_VERSION = 2

const line = z.string().trim().min(1)
const prose = z.string().trim().min(1)

/**
 * Does this merge request need the architect's attention, in one word.
 * `sound` — the shape fits, land it. `discuss` — it works, but a decision in it
 * deserves a conversation. `blocked` — something here should not land as-is.
 */
export const VERDICTS = ['sound', 'discuss', 'blocked'] as const

const verdictBlockSchema = z.object({
  type: z.literal('verdict'),
  verdict: z.enum(VERDICTS),
  /** One line. The thing the reviewer reads in the first two seconds. */
  headline: line,
  detail: prose.optional(),
})

/** How this change touches one system. `read-only` is what a system that is
 *  depended on but unmodified gets — naming it is half the blast radius. */
export const SYSTEM_CHANGE_KINDS = [
  'added',
  'changed',
  'contract-changed',
  'removed',
  'read-only',
] as const

const systemsBlockSchema = z.object({
  type: z.literal('systems'),
  systems: z
    .array(
      z.object({
        name: line,
        /** What it does in *this* change, not what it does in general. */
        role: prose,
        change: z.enum(SYSTEM_CHANGE_KINDS),
      }),
    )
    .min(1),
})

const narrativeBlockSchema = z.object({
  type: z.literal('narrative'),
  title: line.optional(),
  /** Markdown. Rendered through the same react-markdown path Notes uses. */
  body: prose,
})

const diagramBlockSchema = z.object({
  type: z.literal('diagram'),
  title: line.optional(),
  caption: prose.optional(),
  /** Mermaid source. Untrusted agent output — rendered with `securityLevel: 'strict'`. */
  mermaid: prose,
})

/**
 * The **shape of the domain** after this change: the types the merge request adds
 * or reshapes, the fields that matter, and how they relate. Rendered as an
 * entity-relationship diagram.
 *
 * **Data, not a drawing.** The agent supplies entities and relations; the view
 * generates the mermaid `erDiagram` from them (`domain/model-diagram`). An
 * agent-authored mermaid string would have been the cheaper contract and the
 * wrong one (ADR-0011 §2): an ER attribute type is a narrow token — no spaces, no
 * `<`, no `|` — so most TypeScript types worth showing (`Record<string, Member>`,
 * `string | null`) are parse errors, an unquoted relation label that happens to
 * read `one` or `many` collides with a cardinality keyword, and a diagram that
 * fails to draw is indistinguishable from one the agent never wrote. Taking the
 * data means we sanitise it, style it, and draw every model cell the same way.
 *
 * `kind` is required because "which of these types are new" is the first thing an
 * architect asks of a model, and it is the one fact a reader cannot recover from
 * the picture.
 */
export const MODEL_ENTITY_KINDS = ['added', 'changed', 'existing'] as const

/**
 * Deliberately four, and deliberately about multiplicity only. A second axis
 * (identifying vs. referencing, mermaid's solid vs. dashed line) was considered
 * and dropped: it is a distinction an agent gets wrong more often than right, and
 * the relation's `label` carries the verb that actually explains the edge.
 */
export const MODEL_CARDINALITIES = [
  'one-to-one',
  'one-to-many',
  'many-to-many',
  'one-to-optional',
] as const

const modelBlockSchema = z
  .object({
    type: z.literal('model'),
    title: line.optional(),
    caption: prose.optional(),
    entities: z
      .array(
        z.object({
          /** The type's own name, as the code spells it: `Usergroup`, `@sdk/account`. */
          name: line,
          kind: z.enum(MODEL_ENTITY_KINDS),
          /** What it is for, one line. Shown beside the diagram, not inside it. */
          note: prose.optional(),
          /**
           * The fields worth showing — not every field. Empty is legitimate: a
           * pre-existing type included so a relation has somewhere to land does not
           * need its shape restated.
           */
          fields: z
            .array(
              z.object({
                name: line,
                /** As written in the source: `UsergroupId`, `Member[]`, `string | null`. */
                type: line,
                note: prose.optional(),
              }),
            )
            .default([]),
        }),
      )
      .min(1),
    /** May be empty: one new value object with no relations is still a model. */
    relations: z
      .array(
        z.object({
          /** Both ends must name an entity above — validated below. */
          from: line,
          to: line,
          cardinality: z.enum(MODEL_CARDINALITIES),
          /** The verb on the edge: "contains", "resolves to", "is keyed by". */
          label: line,
        }),
      )
      .default([]),
  })
  // A relation to a type the cell never described cannot be drawn honestly: the
  // reader would see a box with no fields and no kind and have no way to tell
  // whether that is the model or an omission. Naming it as an `existing` entity
  // is the agent's way of saying "this one was already here", and it costs one
  // line.
  .superRefine((block, ctx) => {
    const names = new Set(block.entities.map((entity) => entity.name))
    for (const [index, entity] of block.entities.entries()) {
      if (block.entities.findIndex((other) => other.name === entity.name) !== index) {
        ctx.addIssue({
          code: 'custom',
          path: ['entities', index, 'name'],
          message: `duplicate entity "${entity.name}"`,
        })
      }
    }
    for (const [index, relation] of block.relations.entries()) {
      for (const end of ['from', 'to'] as const) {
        if (!names.has(relation[end])) {
          ctx.addIssue({
            code: 'custom',
            path: ['relations', index, end],
            message: `"${relation[end]}" is not one of this model's entities`,
          })
        }
      }
    }
  })

/**
 * A diff the agent chose to show, with a sentence over it saying what to look
 * at. The notebook's main diff cell (ADR-0010 §6).
 *
 * Deliberately **not** a diff viewer: one file per cell, only the hunks that
 * carry the move, and a `caption` that says why. Most of what a move does is not
 * a problem, so a diff that is not attached to a finding is the common case —
 * which is why this exists separately from `finding.hunk`. What the curation
 * left out is reachable from the move page's whole-diff expander instead of
 * being persisted into every report.
 */
const diffBlockSchema = z.object({
  type: z.literal('diff'),
  path: line,
  /** Hint for the highlighter; the unified-diff renderer falls back to plain. */
  language: line.optional(),
  /** What to look at here, and why. One or two sentences. */
  caption: prose.optional(),
  /** Unified diff text (`@@` hunk headers, `+`/`-` lines). */
  diff: z.string().min(1),
})

/** No `nit`. The absence is the altitude rule (ADR-0009 §7). */
export const SEVERITIES = ['high', 'medium', 'low'] as const

const findingBlockSchema = z.object({
  type: z.literal('finding'),
  /** Required: a finding that names no system is a line-level nit wearing a hat. */
  system: line,
  title: line,
  severity: z.enum(SEVERITIES),
  /** Required: the consequence, not the observation. */
  whyItMatters: prose,
  detail: prose.optional(),
  /** The hunk that backs the claim, so it can be checked without leaving the report. */
  hunk: z
    .object({
      path: line,
      /** Hint for the highlighter; the unified-diff renderer falls back to plain. */
      language: line.optional(),
      /** Unified diff text (`@@` hunk headers, `+`/`-` lines). */
      diff: z.string().min(1),
    })
    .optional(),
})

export const LIKELIHOODS = ['high', 'medium', 'low'] as const

const blastRadiusBlockSchema = z.object({
  type: z.literal('blast-radius'),
  rows: z
    .array(
      z.object({
        /** The contract or surface that can break. */
        surface: line,
        /** What breaks if this change is wrong. */
        ifWrong: prose,
        /** Who is downstream of it. */
        downstream: z.array(line).default([]),
        likelihood: z.enum(LIKELIHOODS),
      }),
    )
    .min(1),
})

const questionsBlockSchema = z.object({
  type: z.literal('questions'),
  questions: z
    .array(
      z.object({
        /** Phrased so it can be pasted straight into the MR thread. */
        question: line,
        why: prose.optional(),
      }),
    )
    .min(1),
})

const unverifiedBlockSchema = z.object({
  type: z.literal('unverified'),
  items: z
    .array(
      z.object({
        claim: line,
        /** Required: "why I could not check this" is the useful half. */
        why: prose,
      }),
    )
    .min(1),
})

export const explainBlockSchema = z.discriminatedUnion('type', [
  verdictBlockSchema,
  systemsBlockSchema,
  narrativeBlockSchema,
  diagramBlockSchema,
  modelBlockSchema,
  diffBlockSchema,
  findingBlockSchema,
  blastRadiusBlockSchema,
  questionsBlockSchema,
  unverifiedBlockSchema,
])

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

export type ExplainBlock = z.infer<typeof explainBlockSchema>
export type ExplainMove = z.infer<typeof explainMoveSchema>
export type ExplainReport = z.infer<typeof explainReportSchema>
export type ExplainVerdict = (typeof VERDICTS)[number]
export type ExplainSeverity = (typeof SEVERITIES)[number]
export type ExplainSystemChange = (typeof SYSTEM_CHANGE_KINDS)[number]
export type ExplainModelEntityKind = (typeof MODEL_ENTITY_KINDS)[number]
export type ExplainModelCardinality = (typeof MODEL_CARDINALITIES)[number]

/** Narrowed block types, so renderers and domain helpers can name one arm. */
export type ExplainBlockOf<T extends ExplainBlock['type']> = Extract<ExplainBlock, { type: T }>

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
