import { createFileRoute } from '@tanstack/react-router'
import { syncChart } from '~/server/contexts/gantt/application/sync-chart'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import { chartParams, decodeParams, ganttJson, ganttRespond, type ChartCtx } from './-gantt-http'

// `POST /api/gantt/charts/:chartId/sync` — refresh the mirrored half.
//
// A verb, not a side effect of `GET /charts/:chartId` (ADR-0012 §5): an agent
// doing a cheap id lookup must not pay a Jira round-trip, nor silently mutate
// the chart it was only looking at. The SKILL tells an agent to call this before
// reading if it wants current Jira state; the UI fires it when a chart older
// than five minutes is opened, and on the header's Refresh.
//
// `POST` with no body at all: everything the sync needs — the epic keys — is
// already on the chart, and a body would be a second place to put them.
//
// The response is the whole synced chart rather than the counts, so the common
// case ("sync, then read") is one call. `503` means Jira did not answer and the
// chart is byte-identical; nothing else here can fail that the other routes
// cannot.

const ROUTE = '/api/gantt/charts/$chartId/sync'

export function ganttSyncHandlers(writes: GanttWrites) {
  return {
    POST: ({ params }: ChartCtx) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      return ganttRespond(ROUTE, syncChart(decoded.value.chartId, writes), (chart) =>
        ganttJson(chart, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/sync')({
  server: { handlers: ganttSyncHandlers(liveGanttWrites()) },
})
