import { createFileRoute } from '@tanstack/react-router'
import { createNode } from '~/server/contexts/gantt/application/mutate-chart'
import { createNodeBody } from '~/server/lib/gantt-schema'
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

// `POST /api/gantt/charts/:chartId/nodes` — one lane. Node ids are
// agent-supplied slugs (ADR-0012 §8) so an agent can address a node across many
// turns without carrying a map of opaque identifiers it cannot reconstruct.

const ROUTE = '/api/gantt/charts/$chartId/nodes'

export function ganttNodesHandlers(writes: GanttWrites) {
  return {
    POST: async ({ params, request }: ChartCtx & WithRequest) => {
      const decoded = decodeParams(chartParams, params)
      if (!decoded.ok) return decoded.response
      const body = await decodeJsonBody(request, createNodeBody)
      if (!body.ok) return body.response
      return ganttRespond(ROUTE, createNode(decoded.value.chartId, body.value, writes), (node) =>
        ganttJson(node, 201),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/nodes')({
  server: { handlers: ganttNodesHandlers(liveGanttWrites()) },
})
