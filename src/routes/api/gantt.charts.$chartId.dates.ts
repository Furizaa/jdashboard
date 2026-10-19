import { createFileRoute } from '@tanstack/react-router'
import { seedDatesFromHistory } from '~/server/contexts/gantt/application/seed-dates'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import { chartParams, decodeParams, ganttJson, ganttRespond, type ChartCtx } from './-gantt-http'

// `POST /api/gantt/charts/:chartId/dates` — fill the chart's blank dates from
// its tickets' status histories (ADR-0012 §4, as amended).
//
// A verb beside `sync` rather than part of it, and the difference between the
// two is the half of the chart each touches. Sync refreshes the **mirrored**
// fields Jira owns; this one writes `start` and `end`, which the **chart** owns
// — so folding it into sync would make sync a writer of chart-owned fields,
// which ADR-0012 §5 promises it is not. Separate also means re-runnable on its
// own, and safely: it fills nulls and never overwrites.
//
// It lives on the REST surface rather than only behind the UI because an agent
// cannot do this for itself: clashboard holds the Jira credentials, and
// `acli jira workitem view --json` returns no transitions at all.
//
// `POST` with no body: everything it needs is the chart's own mirrored keys.
// `404` for an unknown chart, before Jira is asked; `503` when Jira answered for
// none of the chart's tickets, and then `chart.json` is byte-identical. One
// ticket Jira will not answer for is **not** a `503` — it is skipped, counted in
// the changelog entry, and the other lanes still get their dates.

const ROUTE = '/api/gantt/charts/$chartId/dates'

export function ganttDatesHandlers(writes: GanttWrites) {
  return {
    POST: ({ params }: ChartCtx) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      return ganttRespond(ROUTE, seedDatesFromHistory(decoded.value.chartId, writes), (chart) =>
        ganttJson(chart, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/dates')({
  server: { handlers: ganttDatesHandlers(liveGanttWrites()) },
})
