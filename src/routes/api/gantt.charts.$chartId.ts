import { createFileRoute } from '@tanstack/react-router'
import { loadChart, withBodyFlags } from '~/server/contexts/gantt/application/load-chart'
import { patchChart } from '~/server/contexts/gantt/application/mutate-chart'
import { patchChartBody } from '~/server/lib/gantt-schema'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import {
  chartParams,
  decodeJsonBody,
  decodeParams,
  ganttErrorResponse,
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
// `DELETE /api/gantt/charts/:chartId` — **refuses, explicitly, with a `405`.**
// Archiving a chart is a confirmed UI action: single-writer is a rule about chart
// *content*, and the irreversible verb over a system of record belongs with the
// human rather than with a process acting on paraphrased instructions
// (ADR-0012 §8).
//
// The refusal is written rather than merely absent because of what absence
// actually does here: with no handler the request falls through to the SSR
// document route and comes back `200` with an HTML shell, which an agent can
// read as success and report as a deletion that never happened. A `405` naming
// the reason is the answer ADR-0012 §9 asks for — an error the consumer can act
// on — and it is a stronger guarantee than an absent key, because the test can
// now assert the thing that matters: that a `DELETE` does not delete.

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

    // Takes no params and reads no body: there is no request shape that would
    // make this succeed, so decoding one would imply there is.
    DELETE: () =>
      ganttErrorResponse(
        405,
        'MethodNotAllowed',
        'A chart cannot be deleted through the API. Archiving is a confirmed action in the clashboard UI, because the irreversible verb over a system of record belongs with the human (ADR-0012 §8).',
      ),

    PATCH: async ({ params, request }: ChartCtx & WithRequest) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      const body = await decodeJsonBody(request, patchChartBody)
      if (!body.ok) return body.response
      return ganttRespond(
        ROUTE,
        withBodyFlags(patchChart(decoded.value.chartId, body.value, writes), writes.deps),
        (chart) => ganttJson(chart, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId')({
  server: { handlers: ganttChartHandlers(liveGanttWrites()) },
})
