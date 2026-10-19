import { createFileRoute } from '@tanstack/react-router'
import { loadChart } from '~/server/contexts/gantt/application/load-chart'
import { patchChart } from '~/server/contexts/gantt/application/mutate-chart'
import { patchChartBody } from '~/server/lib/gantt-schema'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import {
  chartParams,
  decodeJsonBody,
  decodeParams,
  ganttJson,
  ganttRespond,
  type ChartCtx,
  type WithRequest,
} from './-gantt-http'

// `GET /api/gantt/charts/:chartId` — the skeleton, with `hasBody` per node and
// no bodies, so an agent looking up a node id pays nothing for PRD prose.
//
// `PATCH /api/gantt/charts/:chartId` — title and `jiraSources`. `id`, `version`
// and `createdAt` are identity and history; `nodes` and `edges` have their own
// endpoints, because a whole-chart write would make every concurrent edit a
// conflict (ADR-0012 §8).
//
// **There is no `DELETE` here, and its absence is asserted by a test**
// (`-gantt-routes.test.ts`). Archiving a chart is a confirmed UI action:
// single-writer is a rule about chart *content*, and the irreversible verb over
// a system of record belongs with the human rather than with a process acting on
// paraphrased instructions (ADR-0012 §8). An endpoint that was never written is
// indistinguishable from one deleted by accident, so the test is the difference.

const ROUTE = '/api/gantt/charts/$chartId'

export function ganttChartHandlers(writes: GanttWrites) {
  return {
    GET: ({ params }: ChartCtx) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      return ganttRespond(ROUTE, loadChart(decoded.value.chartId, writes.deps), (chart) =>
        ganttJson(chart, 200),
      )
    },

    PATCH: async ({ params, request }: ChartCtx & WithRequest) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      const body = await decodeJsonBody(request, patchChartBody)
      if (!body.ok) return body.response
      return ganttRespond(ROUTE, patchChart(decoded.value.chartId, body.value, writes), (chart) =>
        ganttJson(chart, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId')({
  server: { handlers: ganttChartHandlers(liveGanttWrites()) },
})
