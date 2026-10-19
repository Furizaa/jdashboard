import { useRef } from 'react'
import { isSyncStale, type SyncStaleness } from '../domain'

// The stale-on-open trigger: a chart whose mirrored half is older than five
// minutes syncs **once** when it is opened, and a fresh one does not sync at all
// (ADR-0012 §5).
//
// **This is a mutation guarded on the query's data, not an effect**, which is
// the repo's rule and here also the shorter answer. An effect would fire after
// a render that already drew the stale chart, would need a dependency array
// naming `lastSyncedAt` — a value that changes *because of* the sync — and would
// then need the same guard below anyway to stop the loop. The guard is the whole
// mechanism, so there is nothing left for the effect to do.
//
// Three things must be true, and each is one clause:
//
// 1. **Once per chart.** `requested` is a ref, not state: it is read and written
//    in the same pass and must not itself cause a render. Keyed by chart id so
//    opening a second chart is a second decision, and so the double invocation
//    React's strict mode does of one render is one request, not two.
// 2. **Never while one is in flight.** `isPending` is the mutation's own flag,
//    which covers the header's Refresh as well — they are the same mutation.
// 3. **Never for a fresh chart.** `isSyncStale` is the pure rule, and it also
//    answers "never for a chart with no epics behind it".
//
// The rejection is swallowed on purpose. A failed sync is the mutation's own
// state — the header shows it — and this call site must not become an unhandled
// rejection on a surface whose whole job is to render a plan that is already on
// disk.

export type StaleSyncInput = {
  readonly chartId: string
  /** `null` until the chart query answers; nothing is decided before then. */
  readonly chart: SyncStaleness | null
  readonly sync: (chartId: string) => Promise<unknown>
  readonly isPending: boolean
  /** Injected so the rule is testable without the clock. */
  readonly now?: () => number
}

export function useStaleChartSync({
  chartId,
  chart,
  sync,
  isPending,
  now = Date.now,
}: StaleSyncInput): void {
  const requested = useRef<string | null>(null)
  if (chart !== null && !isPending && requested.current !== chartId && isSyncStale(chart, now())) {
    requested.current = chartId
    void sync(chartId).catch(() => {
      // Held by the mutation, surfaced by the header; see the note above.
    })
  }
}
