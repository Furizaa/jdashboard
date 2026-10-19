import { createFileRoute } from '@tanstack/react-router'
import { loadChartList } from '~/server/contexts/gantt/application/load-chart'
import { createChart } from '~/server/contexts/gantt/application/mutate-chart'
import { createChartBody } from '~/server/lib/gantt-schema'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import { decodeJsonBody, ganttJson, ganttRespond, type WithRequest } from './-gantt-http'

// `GET /api/gantt/charts` — the list, and the SKILL's probe: an agent calls it
// first and, on connection-refused, stops and reports that clashboard is not
// running rather than planning into a socket (ADR-0012 §12).
//
// `POST /api/gantt/charts` — create. `jiraSources` is stored here and discovered
// from in slice 95; import and sync are one code path, which is why there is no
// separate `import` verb to rot beside it.
//
// Both methods are sibling keys in one file because that is the shape of a
// TanStack server route: a path is a file, and the methods live inside it.
//
// The handlers are a factory over the write queue so a test can drive them
// against a fake disk; the route hands them the one live queue.

const ROUTE = '/api/gantt/charts'

export function ganttChartsHandlers(writes: GanttWrites) {
  return {
    GET: () =>
      ganttRespond(ROUTE, loadChartList(writes.deps), (charts) => ganttJson({ charts }, 200)),

    POST: async ({ request }: WithRequest) => {
      const body = await decodeJsonBody(request, createChartBody)
      if (!body.ok) return body.response
      return ganttRespond(ROUTE, createChart(body.value, writes), (chart) => ganttJson(chart, 201))
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts')({
  server: { handlers: ganttChartsHandlers(liveGanttWrites()) },
})
