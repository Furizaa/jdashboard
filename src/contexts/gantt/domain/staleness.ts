import type { GanttChart } from '~/kernel'

// When a chart's mirrored half is old enough to be worth one Jira search.
//
// The rule is here rather than at the call site for the usual reason — it is a
// decision about the domain and it is three branches, two of which are easy to
// get wrong in a hook — and because "opening a stale chart syncs it exactly
// once" is then a property of a pure function a table test can pin down.

/**
 * Five minutes, the window ADR-0012 §5 names. Long enough that opening three
 * charts in a row is not three Jira searches; short enough that a chart someone
 * came back to after a meeting is current.
 */
export const SYNC_STALE_AFTER_MS = 5 * 60 * 1000

/** Everything the rule reads, which is two fields of the chart and the clock. */
export type SyncStaleness = Pick<GanttChart, 'jiraSources' | 'lastSyncedAt'>

/**
 * Three branches, in the order they matter:
 *
 * - **No `jiraSources`** — never stale. A chart with no epics behind it has no
 *   mirrored half, so a sync would be a disk write and a changelog entry saying
 *   nothing happened.
 * - **Never synced** — stale. This is the chart an agent created with
 *   `jiraSources` whose bootstrap sync did not land, and one search fixes it.
 * - **Otherwise** — the elapsed time, with an unparseable `lastSyncedAt` read as
 *   stale: a sync overwrites it with a good one, where trusting it would leave
 *   the chart permanently fresh and permanently wrong.
 */
export function isSyncStale(chart: SyncStaleness, nowMs: number): boolean {
  if (chart.jiraSources.length === 0) return false
  if (chart.lastSyncedAt === null) return true
  const syncedAt = Date.parse(chart.lastSyncedAt)
  if (Number.isNaN(syncedAt)) return true
  return nowMs - syncedAt >= SYNC_STALE_AFTER_MS
}
