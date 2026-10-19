import { createFileRoute } from '@tanstack/react-router'
import { createEdge } from '~/server/contexts/gantt/application/mutate-chart'
import { createEdgeBody } from '~/server/lib/gantt-schema'
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

// `POST /api/gantt/charts/:chartId/edges` — one `from blocks to` arrow. There is
// no `kind` to pick: every edge means the same thing, and a second relation
// would be additive.
//
// **An edge that closes a cycle is accepted, with a `201`.** The API never
// refuses to record a dependency someone declared (ADR-0012 §6): an agent
// building a chart incrementally creates loops it means to resolve two calls
// later, and a plan that is impossible should *look* impossible rather than be
// impossible to write down. The layout names the loop and draws its edges dashed.

const ROUTE = '/api/gantt/charts/$chartId/edges'

export function ganttEdgesHandlers(writes: GanttWrites) {
  return {
    POST: async ({ params, request }: ChartCtx & WithRequest) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      const body = await decodeJsonBody(request, createEdgeBody)
      if (!body.ok) return body.response
      return ganttRespond(ROUTE, createEdge(decoded.value.chartId, body.value, writes), (edge) =>
        ganttJson(edge, 201),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/edges')({
  server: { handlers: ganttEdgesHandlers(liveGanttWrites()) },
})
