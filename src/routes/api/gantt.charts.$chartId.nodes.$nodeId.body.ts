import { createFileRoute } from '@tanstack/react-router'
import { loadNodeBody } from '~/server/contexts/gantt/application/load-chart'
import { putBody } from '~/server/contexts/gantt/application/mutate-chart'
import { liveGanttWrites, type GanttWrites } from '~/server/lib/gantt-writes'
import {
  decodeParams,
  ganttJson,
  ganttMarkdown,
  ganttRespond,
  nodeParams,
  type NodeCtx,
  type WithRequest,
} from './-gantt-http'

// One lane's markdown body — the PRD or issue the chart is the only copy of.
//
// The body travels as **markdown, not as a JSON field**, in both directions: it
// is the one payload on this surface that is a document rather than a record, and
// JSON-escaping a two-hundred-line PRD into a single string field is the step an
// agent most reliably gets wrong. It is also why `gantt-schema.ts` declares no
// request schema for it — there is no field to validate, only text. Failures are
// still JSON, like every other failure on this surface (ADR-0012 §9).
//
// `GET` answers `200` with an empty document for a node that has no body yet; the
// node existing is what the status means, and `hasBody` on `GET /charts/:chartId`
// is how an agent tells "empty" from "none" without a second call.
//
// `PUT` goes through the store's `writeBody`, so the predecessor is kept as
// `<nodeId>.md.prev` — the one level of undo over the only content in the app
// that is genuinely irreplaceable (ADR-0012 §11). The response says whether a
// snapshot was taken.

const ROUTE = '/api/gantt/charts/$chartId/nodes/$nodeId/body'

export function ganttNodeBodyHandlers(writes: GanttWrites) {
  return {
    GET: ({ params }: NodeCtx) => {
      const decoded = decodeParams(nodeParams, params)
      if (!decoded.ok) return decoded.response
      const { chartId, nodeId } = decoded.value
      return ganttRespond(ROUTE, loadNodeBody(chartId, nodeId, writes.deps), (view) =>
        ganttMarkdown(view.markdown ?? ''),
      )
    },

    PUT: async ({ params, request }: NodeCtx & WithRequest) => {
      const decoded = decodeParams(nodeParams, params)
      if (!decoded.ok) return decoded.response
      const markdown = await request.text()
      const { chartId, nodeId } = decoded.value
      return ganttRespond(ROUTE, putBody(chartId, nodeId, markdown, writes), (result) =>
        ganttJson(result, 200),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/charts/$chartId/nodes/$nodeId/body')({
  server: { handlers: ganttNodeBodyHandlers(liveGanttWrites()) },
})
