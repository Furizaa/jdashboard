import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { renderGanttSkill } from '~/server/lib/gantt-skill'
import { createChartBody } from '~/server/lib/gantt-schema'
import { decodeParams, ganttMarkdown, type WithRequest } from './-gantt-http'

// `GET /api/gantt/skill` — the document that teaches this API, as
// `text/markdown`, with the base URL and the chart id already substituted.
//
// The same text the header's copy button puts on the clipboard (ADR-0012 §12).
// Both exist because the two consumers arrive differently: a person pastes it
// into an agent, and an agent that already has a chart id would rather fetch it.
//
// The one route on this surface with no application service behind it — there is
// no chart to read, only a file — so it neither locks nor touches the store, and
// it is the one safe thing to call before knowing whether a chart exists at all.

/** `?chart=` is optional, and must be a slug when it is there. */
const skillQuery = z.object({ chart: createChartBody.shape.id.nullable() })

export function ganttSkillHandlers() {
  return {
    GET: async ({ request }: WithRequest) => {
      const url = new URL(request.url)
      // A `?chart=` that is not a slug is a `400`, in the one shape this surface
      // uses, rather than a document quietly pointed at a chart that cannot
      // exist — an agent acting on the latter would write into nothing.
      const query = decodeParams(skillQuery, { chart: url.searchParams.get('chart') })
      if (!query.ok) return query.response
      return ganttMarkdown(
        await renderGanttSkill({ baseUrl: url.origin, chartId: query.value.chart }),
      )
    },
  }
}

export const Route = createFileRoute('/api/gantt/skill')({
  server: { handlers: ganttSkillHandlers() },
})
