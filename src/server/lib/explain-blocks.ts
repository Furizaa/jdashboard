// The Explain report's **cell vocabulary**: one Zod schema per block type, and
// the discriminated union over them.
//
// `Block` is what a notebook page is made of. The union is matched exhaustively
// in the view (`renderBlock` uses `ts-pattern.exhaustive()`), so adding a block
// type here is a compile error until it has a renderer — the invariant ADF
// rendering already relies on.
//
// The vocabulary is **architect-altitude by construction**. There is no `nit`
// severity to select, and a `finding` cannot be expressed without naming the
// `system` it concerns and a `whyItMatters`. A schema that cannot represent a
// line-length complaint is a cheaper and more durable instruction than a prompt
// asking the agent not to make one.
//
// Where a list of these may appear — the overview, and every move — is the
// *document* shape, and lives in `explain-report.ts` alongside the boundary
// parse that validates it.
//
// Zod (not `effect/Schema`) because this shape crosses to the client: the
// per-repo rule is one validator per side of the boundary, and the client-facing
// schemas are Zod (CONTEXT-MAP, "Schema (client-crossing)").

import { z } from 'zod'

export const line = z.string().trim().min(1)
export const prose = z.string().trim().min(1)

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

export type ExplainBlock = z.infer<typeof explainBlockSchema>
export type ExplainVerdict = (typeof VERDICTS)[number]
export type ExplainSeverity = (typeof SEVERITIES)[number]
export type ExplainSystemChange = (typeof SYSTEM_CHANGE_KINDS)[number]
export type ExplainModelEntityKind = (typeof MODEL_ENTITY_KINDS)[number]
export type ExplainModelCardinality = (typeof MODEL_CARDINALITIES)[number]

/** Narrowed block types, so renderers and domain helpers can name one arm. */
export type ExplainBlockOf<T extends ExplainBlock['type']> = Extract<ExplainBlock, { type: T }>
