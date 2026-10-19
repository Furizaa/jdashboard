import { createFileRoute } from '@tanstack/react-router'
import { deleteNode, patchNode } from '~/server/contexts/gantt/application/mutate-chart'
import { patchNodeBody } from '~/server/lib/gantt-schema'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import {
  decodeJsonBody,
  decodeParams,
  ganttJson,
  ganttRespond,
  nodeParams,
  type NodeCtx,
  type WithRequest,
} from './-gantt-http'

// `PATCH` and `DELETE` for one lane.
//
// A `PATCH` naming a **mirrored** field (`title`, `column`, `status`,
// `assignee`) on a node whose source is `jira` comes back `422`: the next sync
// would overwrite it, so accepting the write would be a lie (ADR-0012 §3). The
// same patch on a local node is fine, and `start` / `end` / `parentId` / `order`
// are chart-owned on every node regardless of source.
//
// `DELETE` **reparents** the node's children to its own parent — it neither
// cascades nor orphans — removes every edge touching it, and erases its body and
// its one level of undo. The response names all three, because "what did that
// actually move" is the question an agent asks next.

const ROUTE = '/api/gantt/charts/$chartId/nodes/$nodeId'

export function ganttNodeHandlers(writes: GanttWrites) {
  return {
    PATCH: async ({ params, request }: NodeCtx & WithRequest) => {
      const decoded = decodeParams(nodeParams, params)
      if (!decoded.ok) return decoded.response
      const body = await decodeJsonBody(request, patchNodeBody)
      if (!body.ok) return body.response
      const { chartId, nodeId } = decoded.value
      return ganttRespond(ROUTE, patchNode(chartId, nodeId, body.value, writes), (node) =>
        ganttJson(node, 200),
      )
    },

    DELETE: ({ params }: NodeCtx) => {
      const decoded = decodeParams(nodeParams, params)
      if (!decoded.ok) return decoded.response
      const { chartId, nodeId } = decoded.value
      return ganttRespond(ROUTE, deleteNode(chartId, nodeId, writes), (result) =>
        ganttJson(result, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/nodes/$nodeId')({
  server: { handlers: ganttNodeHandlers(liveGanttWrites()) },
})
