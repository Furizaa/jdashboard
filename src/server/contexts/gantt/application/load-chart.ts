import { Effect } from 'effect'
import {
  bodyNodeIds,
  listCharts,
  readBody,
  readChart,
  type GanttChartSummary,
  type GanttStoreDeps,
} from '../../../lib/gantt-store'
import type { GanttChart, GanttNode } from '../../../lib/gantt-schema'
import { ChartNotFound, NodeNotFound } from '../errors'

// The read side of a Gantt chart, shared by both consumers (ADR-0006's own
// sentence, ADR-0012 §7): the REST routes an agent drives and — from slice 92 —
// the UI's server functions. Neither layer may import the other, so the
// use-case lives here and both call sites import it from `application/`.
//
// These are reads, so they take the store deps directly rather than the write
// queue: there is nothing to serialise, and making a read wait on a write would
// make a cheap id lookup pay for someone else's PRD.

/**
 * `hasBody` is **derived at read time** from the presence of `bodies/<id>.md`
 * (ADR-0012 §11). A stored flag would be a second source of truth for a file's
 * existence, and the one that goes stale is always the flag.
 */
export type GanttNodeView = GanttNode & { readonly hasBody: boolean }

export type GanttChartView = Omit<GanttChart, 'nodes'> & {
  readonly nodes: readonly GanttNodeView[]
}

export type GanttBodyView = {
  readonly chartId: string
  readonly nodeId: string
  /** `null` when the node has no body at all, which is the common case. */
  readonly markdown: string | null
}

/** Every chart on disk, header fields and counts only — never their nodes. */
export function loadChartList(
  deps: GanttStoreDeps,
): Effect.Effect<readonly GanttChartSummary[], never> {
  return Effect.promise(() => listCharts(deps))
}

/**
 * One chart's skeleton. The bodies are **not** here: `GET /charts/:chartId`
 * returns the tree with a `hasBody` flag per node and bodies are fetched one at
 * a time, so an agent looking up a node id pays nothing for PRD prose.
 */
export function loadChart(
  chartId: string,
  deps: GanttStoreDeps,
): Effect.Effect<GanttChartView, ChartNotFound> {
  return Effect.promise(async () => {
    const chart = await readChart(chartId, deps)
    if (chart === null) return null
    // One directory read for the whole chart rather than one stat per node.
    const withBody = new Set(await bodyNodeIds(chartId, deps))
    return {
      ...chart,
      // A copy on purpose: the node read off disk must not grow a field the schema
      // does not have.
      // oxlint-disable-next-line no-map-spread -- see comment above
      nodes: chart.nodes.map((node) => ({ ...node, hasBody: withBody.has(node.id) })),
    } satisfies GanttChartView
  }).pipe(
    Effect.flatMap((chart) =>
      chart === null ? Effect.fail(new ChartNotFound({ chartId })) : Effect.succeed(chart),
    ),
  )
}

/**
 * One node's markdown body. The node has to exist for the answer "no body" to
 * mean anything — otherwise a typo'd node id would read as an empty PRD, which
 * is the kind of silence an agent cannot correct.
 */
export function loadNodeBody(
  chartId: string,
  nodeId: string,
  deps: GanttStoreDeps,
): Effect.Effect<GanttBodyView, ChartNotFound | NodeNotFound> {
  return loadChart(chartId, deps).pipe(
    Effect.flatMap((chart) =>
      chart.nodes.some((node) => node.id === nodeId)
        ? Effect.promise(() => readBody(chartId, nodeId, deps))
        : Effect.fail(new NodeNotFound({ chartId, nodeId })),
    ),
    Effect.map((markdown) => ({ chartId, nodeId, markdown })),
  )
}
