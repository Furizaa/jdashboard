import { Effect } from 'effect'
import type { JiraGateway } from '../../../gateways/jira/port'
import type { CreateChartBody, GanttChart } from '../../../lib/gantt-schema'
import type { GanttWrites } from '../../../lib/gantt-writes'
import { createChart } from './mutate-chart'
import { syncChart, type SyncChartError } from './sync-chart'
import type { DuplicateChartId, InvalidChartPayload } from '../errors'

// `POST /charts` with `jiraSources`: the chart arrives **already populated**,
// one mirrored node per discovered ticket, flat and undated (ADR-0012 §5).
//
// The agent creating every node itself was rejected — forty round-trips and a
// great deal of context for work the server does in one call, and an agent that
// silently skips the tickets it did not notice. What is left for the agent is
// the part that needs judgement: grouping under PRD lanes, dating, declaring
// the edges Jira does not have, writing bodies.
//
// **Import and sync are one code path**, which is why there is no separate
// `import` verb to rot beside `sync`, and why this file is four lines of
// composition rather than a second reconciler. `createChart` already stores
// `jiraSources`; the first sync is simply the first sync.

export type BootstrapChartError = DuplicateChartId | InvalidChartPayload | SyncChartError

/**
 * Create, then fill. In that order, deliberately: if Jira is unreachable the
 * caller gets its `503` and the chart exists but empty, which a later sync
 * fills. The alternative — discover first, create second — pays a Jira
 * round-trip to discover that the chart id was already taken, and leaves the
 * agent with nothing at all after a transport blip.
 *
 * A chart with no `jiraSources` never touches Jira and keeps `lastSyncedAt:
 * null`: there is nothing mirrored in it to be stale.
 */
export function bootstrapChart(
  body: CreateChartBody,
  writes: GanttWrites,
): Effect.Effect<GanttChart, BootstrapChartError, JiraGateway> {
  return createChart(body, writes).pipe(
    Effect.flatMap(
      (chart): Effect.Effect<GanttChart, BootstrapChartError, JiraGateway> =>
        chart.jiraSources.length === 0 ? Effect.succeed(chart) : syncChart(chart.id, writes),
    ),
  )
}
