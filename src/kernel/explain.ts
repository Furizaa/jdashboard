// Explain: an architect-altitude review of one merge request, produced by a
// headless read-only agent working in a detached worktree of the MR's head
// commit (ADR-0009). The report is a typed block document, not prose.
//
// Everything the Explain context renders arrives through this file. The block
// union and its Zod schema are owned server-side (`explain-report.ts` validates
// at the boundary, once), the tab and run shapes by their server modules; the
// client refers to all of them through the kernel, never `~/server/...`
// directly.
export type {
  ExplainBlock,
  ExplainBlockOf,
  ExplainReport,
  ExplainSeverity,
  ExplainSystemChange,
  ExplainVerdict,
} from '~/server/lib/explain-report'

// Types only, deliberately. A *value* re-export here would pull the report's Zod
// schema into every module that imports the kernel barrel, to no purpose: the
// schema's one job is validating at the server boundary, and the client only
// ever reads the result of that.

/** One tab's state, and the progress events the SSE channel carries. */
export type { ExplainActivityKind } from '~/server/lib/explain-agent'
export type { ExplainActivityLine, ExplainPhase, ExplainRunEvent } from '~/server/lib/explain-runs'
export type { ExplainTab } from '~/server/lib/explain-tab'

/** The server-function result types, per the kernel rule. */
export type {
  CloseExplainResult,
  GetExplainRunResult,
  ListExplainRunsResult,
  StartExplainResult,
} from '~/server/server-functions/explain'
