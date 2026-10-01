// The Explain report contract: the one place the agent's output stops being
// text and becomes a typed domain object.
//
// The agent returns `{ version: 1, blocks: Block[] }` where `Block` is a
// discriminated union (ADR-0009 §7). Two consequences are the whole point:
//
//   - **Validated once, at the server boundary.** Zod runs here, before the
//     report is persisted or streamed, so a malformed reply becomes a tagged
//     error that keeps the raw text for debugging rather than a half-rendered
//     tab.
//   - **Matched exhaustively in the view.** `renderBlock` matches this union
//     with `ts-pattern.exhaustive()`, so adding a block type is a compile error
//     until it has a renderer — the invariant ADF rendering already relies on.
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

/** Bumped only on a breaking change to the block union. A report that names any
 *  other version is rejected rather than best-effort rendered. */
export const EXPLAIN_REPORT_VERSION = 1

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
  findingBlockSchema,
  blastRadiusBlockSchema,
  questionsBlockSchema,
  unverifiedBlockSchema,
])

export const explainReportSchema = z.object({
  version: z.literal(EXPLAIN_REPORT_VERSION),
  blocks: z.array(explainBlockSchema).min(1),
})

export type ExplainBlock = z.infer<typeof explainBlockSchema>
export type ExplainReport = z.infer<typeof explainReportSchema>
export type ExplainVerdict = (typeof VERDICTS)[number]
export type ExplainSeverity = (typeof SEVERITIES)[number]
export type ExplainSystemChange = (typeof SYSTEM_CHANGE_KINDS)[number]

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
