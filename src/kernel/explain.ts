// Explain: an architect-altitude review of one merge request, produced by a
// headless read-only agent working in a detached worktree of the MR's head
// commit (ADR-0009). The report is a typed **chaptered document**, not prose:
// an overview plus one `ExplainMove` per logical change, each a notebook page of
// cells (ADR-0010).
//
// Everything the Explain context renders arrives through this file. The block
// union, the move shape and their Zod schema are owned server-side
// (`explain-report.ts` validates at the boundary, once), the tab and run shapes
// by their server modules; the client refers to all of them through the kernel,
// never `~/server/...` directly.
export type {
  ExplainBlock,
  ExplainBlockOf,
  ExplainModelCardinality,
  ExplainModelEntityKind,
  ExplainMove,
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
  GetExplainDiffsResult,
  GetExplainRunResult,
  ListExplainRunsResult,
  StartExplainResult,
} from '~/server/server-functions/explain'

/**
 * One file's diff as GitLab has it *now*, for a move page's whole-diff expander
 * (ADR-0010 §6). Deliberately not part of the report: it is a live read, so it
 * describes the merge request's current state rather than the commit the report
 * was written against.
 */
export type { ExplainDiffFile } from '~/server/lib/mr-diff'
