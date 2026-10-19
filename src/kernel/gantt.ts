// Gantt: a recursive tree of lanes over a time axis, with `blocks` arrows
// between them (ADR-0012). A chart's nodes come from two places at once —
// mirrored Jira tickets, kept in step by a non-destructive sync, and
// agent-authored PRDs and issues for which the chart is the only copy.
//
// Everything the Gantt context renders arrives through this file. The chart,
// node and edge shapes are owned by `gantt-schema.ts`, which validates them at
// the server boundary once; the list summary belongs to the store and the audit
// entry to the changelog store. The client refers to all of them through the
// kernel, never `~/server/...` directly.
export type {
  GanttChart,
  GanttEdge,
  GanttEdgeSource,
  GanttNode,
  GanttNodeSource,
} from '~/server/lib/gantt-schema'
export type { GanttChartSummary } from '~/server/lib/gantt-store'
export type { GanttChangelogActor, GanttChangelogEntry } from '~/server/lib/gantt-changelog-store'

// Types only, deliberately — and here that rule has a second edge beyond the one
// `explain.ts` states. The Zod schema's one job is validating at the server
// boundary, and the client only ever reads the result of that; but the Gantt UI
// is also **read-only by design** (ADR-0012 §8), so a client module that could
// reach a body schema would be holding a tool for a job it is not allowed to do.
// The agent is the only writer, and it writes over HTTP.

/**
 * The read-time view of a chart: every node as stored, plus `hasBody` derived
 * from the presence of `bodies/<id>.md` (ADR-0012 §11). The layout function
 * takes a `GanttChart`, so a view is what the presenter holds and a chart is
 * what it hands down.
 */
export type {
  GanttBodyView,
  GanttChartView,
  GanttKeyIndex,
  GanttKeyLocation,
  GanttNodeView,
} from '~/server/contexts/gantt/application/load-chart'

/** The server-function result types, per the kernel rule. */
export type {
  ArchiveGanttChartResult,
  GetGanttBodyResult,
  GetGanttChangelogResult,
  GetGanttChartResult,
  GetGanttKeyIndexResult,
  GetGanttSkillResult,
  ListGanttChartsResult,
  SeedGanttDatesResult,
  SyncGanttChartResult,
} from '~/server/server-functions/gantt'
