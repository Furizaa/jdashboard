import { Effect } from 'effect'
import {
  bodyNodeIds,
  listChartIds,
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
 * The **one** `hasBody` derivation, and the only place it is written.
 *
 * One directory read for the whole chart rather than one stat per node, and a
 * copy of each node on purpose: the node read off disk must not grow a field the
 * schema does not have.
 */
async function chartView(chart: GanttChart, deps: GanttStoreDeps): Promise<GanttChartView> {
  const withBody = new Set(await bodyNodeIds(chart.id, deps))
  return {
    ...chart,
    // oxlint-disable-next-line no-map-spread -- see the note above
    nodes: chart.nodes.map((node) => ({ ...node, hasBody: withBody.has(node.id) })),
  } satisfies GanttChartView
}

/**
 * **Every route that answers with a whole chart answers with the same shape.**
 *
 * `GET /charts/:chartId` is not the only one: `POST /charts` answers with the
 * bootstrapped chart and `POST /charts/:chartId/dates` with the seeded one, and
 * both used to hand back the raw `GanttChart` their application service returns —
 * where `hasBody` was not `false`, it was **missing**, so an agent reading either
 * response as a chart read saw `undefined` on a key the SKILL promises is there.
 *
 * A combinator over the program rather than a second derivation beside it, so the
 * five responses cannot drift: there is one `chartView` and every route that
 * answers with a whole chart goes through it.
 */
export function withBodyFlags<E, R>(
  program: Effect.Effect<GanttChart, E, R>,
  deps: GanttStoreDeps,
): Effect.Effect<GanttChartView, E, R> {
  return program.pipe(Effect.flatMap((chart) => Effect.promise(() => chartView(chart, deps))))
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
  return Effect.promise(() => readChart(chartId, deps)).pipe(
    Effect.flatMap((chart) =>
      chart === null
        ? Effect.fail(new ChartNotFound({ chartId }))
        : Effect.promise(() => chartView(chart, deps)),
    ),
  )
}

/** Where one Jira key sits in the plan: which chart, and which lane in it. */
export type GanttKeyLocation = { readonly chartId: string; readonly nodeId: string }

/**
 * Every mirrored Jira key on any chart, to the lane that carries it.
 *
 * This is the command palette's **legality input** for `show-in-gantt`: `g` is
 * offered on a ticket that appears somewhere in the plan and is absent — not
 * disabled — on one that does not. The palette never reaches `contexts/gantt`
 * for it; it gets this record and hands off through the URL (ADR-0008).
 *
 * One pass over every chart's nodes, because the question is "is this key
 * anywhere" and there is no cheaper shape than a reverse index for that. A key
 * on **two** charts resolves to the first by chart id: `listChartIds` is sorted,
 * so the answer is at least stable, and offering a second destination would mean
 * a sub-list for a case that is a mistake in the plan rather than a choice.
 */
export type GanttKeyIndex = Readonly<Record<string, GanttKeyLocation>>

export function loadKeyIndex(deps: GanttStoreDeps): Effect.Effect<GanttKeyIndex, never> {
  return Effect.promise(async () => {
    const index: Record<string, GanttKeyLocation> = {}
    for (const chartId of await listChartIds(deps)) {
      // Sequential for the reason `listCharts` is: a handful of small local
      // files, and a bounded pool would be more machinery than the read is worth.
      // oxlint-disable-next-line no-await-in-loop -- see comment above
      const chart = await readChart(chartId, deps)
      if (chart === null) continue
      for (const node of chart.nodes) {
        if (node.source.kind !== 'jira') continue
        index[node.source.key] ??= { chartId, nodeId: node.id }
      }
    }
    return index
  })
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
