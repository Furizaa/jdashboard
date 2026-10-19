import { createFileRoute } from '@tanstack/react-router'
import { deleteEdge } from '~/server/contexts/gantt/application/mutate-chart'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import { decodeParams, edgeParams, ganttJson, ganttRespond, type EdgeCtx } from './-gantt-http'

// `DELETE /api/gantt/charts/:chartId/edges/:edgeId` — withdraw a declared
// dependency. This is a destructive verb the agent *does* get, and the asymmetry
// with `DELETE /charts/:chartId` is the point: an edge is one claim about
// ordering, recoverable by re-declaring it, whereas a chart is the only copy of
// a quarter of planning (ADR-0012 §8).
//
// The deleted edge comes back in the response, which is what makes re-declaring
// it a copy rather than a reconstruction.

const ROUTE = '/api/gantt/charts/$chartId/edges/$edgeId'

export function ganttEdgeHandlers(writes: GanttWrites) {
  return {
    DELETE: ({ params }: EdgeCtx) => {
      const decoded = decodeParams(edgeParams, params)
      if (!decoded.ok) return decoded.response
      const { chartId, edgeId } = decoded.value
      return ganttRespond(ROUTE, deleteEdge(chartId, edgeId, writes), (edge) =>
        ganttJson(edge, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/edges/$edgeId')({
  server: { handlers: ganttEdgeHandlers(liveGanttWrites()) },
})
