import type { GanttChart, GanttNode } from '~/kernel'
import { addDays } from './day'
import { datedSpanOf, openSpanOf, type GanttSpan } from './child-span'
import type { GanttTree } from './tree'

// The invented span: where an **undated** lane would fall if somebody dated it.
//
// ADR-0012 §4 held that an undated lane gets no bar, because a bar is a plan and
// the chart must not fabricate one. That was right about the *assertion* and
// wrong about the *consequence*. A chart built from a real epic arrives with
// most of its unstarted work undated, and `TO DO` and blocked lanes are exactly
// the ones a reader opens a Gantt to find — so the honest-but-blank rendering
// made the chart useless for its primary question, "what do I work on next".
// §4's amendment of 2026-10-19 (ii) is the resolution: the lane gets a span, and
// the span is drawn as a **ghost** — a dashed outline with no fill — so it can
// never be mistaken for a date anyone set. See `view/GanttBar.tsx`.
//
// Three rules keep the invention honest:
//
//   - **Leaves only.** A parent with children already answers "when" with its
//     child-span underlay (`child-span.ts`), and a ghost over the top of that
//     would be the chart arguing with itself.
//   - **Never in the past.** Unstarted work cannot have started last month, so a
//     ghost begins at `today` at the earliest however long ago its blocker
//     finished. That is also what makes a screenful of ready work line up at
//     today instead of scattering across the lane's history.
//   - **After what blocks it.** A ghost begins the day after the latest of its
//     blockers ends, which is what turns a column of identical week-long bars
//     into a readable queue: the thing with nothing in front of it sits at
//     today, and the thing three hops back sits three weeks out.
//
// Pure functions over kernel types. No I/O, no time, no framework.

/**
 * One week, inclusive — `start` plus six days.
 *
 * A week rather than a day or a sprint because it is the smallest unit that
 * renders as a *bar* at every zoom (a single day is a hairline at quarter zoom)
 * and the largest that nobody would mistake for an estimate. It is deliberately
 * uniform: a varying default would be a forecast, and the whole point of the
 * ghost is that it is not one.
 */
export const GHOST_SPAN_DAYS = 7

/**
 * An invented span, and the blocker it was placed after — `null` when nothing
 * blocks the lane and it simply sits at today.
 *
 * The blocker rides along so the view can say *why* the bar is where it is. A
 * dashed bar three weeks out with no explanation reads as a bug; "no dates —
 * after hdr-20931" reads as the queue it is.
 */
export type GanttGhostSpan = GanttSpan & {
  readonly afterBlocker: string | null
}

/**
 * The day work placed *after* this node may begin, or `null` when the node says
 * nothing about when it finishes.
 *
 * `null` for an open-ended lane is the important arm: work in flight with no
 * forecast end cannot push anything out by a known amount, and guessing one
 * would be the forecast ADR-0012 §4 refuses to make. The lane waiting on it
 * falls back to today, which understates the wait and never invents a date.
 */
function resolvedEnd(
  node: GanttNode,
  ghostOf: (id: string) => GanttGhostSpan | null,
): string | null {
  const dated = datedSpanOf(node)
  if (dated !== null) return dated.end
  if (openSpanOf(node) !== null) return null
  return ghostOf(node.id)?.end ?? null
}

/**
 * Every undated **leaf** lane's invented span, keyed by node id.
 *
 * Resolved recursively, because a chain of undated work is the common shape: a
 * ticket blocked by a ticket blocked by a ticket, none of them dated, which
 * should read as three consecutive weeks rather than three bars stacked on
 * today. The memo doubles as the cycle guard — a node already being resolved
 * contributes no end rather than recursing, so a dependency loop places its
 * members at today instead of hanging, and `cycles.ts` is what reports the loop.
 */
export function ghostSpansFor(
  chart: GanttChart,
  tree: GanttTree,
  today: string,
): ReadonlyMap<string, GanttGhostSpan> {
  const byId = new Map(chart.nodes.map((node) => [node.id, node] as const))
  const blockersOf = new Map<string, string[]>()
  for (const edge of chart.edges) {
    const blockers = blockersOf.get(edge.to)
    if (blockers === undefined) blockersOf.set(edge.to, [edge.from])
    else blockers.push(edge.from)
  }

  const resolved = new Map<string, GanttGhostSpan | null>()
  const resolving = new Set<string>()

  const ghostOf = (nodeId: string): GanttGhostSpan | null => {
    const memo = resolved.get(nodeId)
    if (memo !== undefined) return memo
    // Mid-recursion means a `blocks` cycle. Contributing nothing collapses the
    // loop's members onto today, which is the right shape for a plan that cannot
    // be ordered at all.
    if (resolving.has(nodeId)) return null

    const node = byId.get(nodeId)
    const childless = (tree.byId.get(nodeId)?.children.length ?? 0) === 0
    if (node === undefined || node.start !== null || !childless) {
      resolved.set(nodeId, null)
      return null
    }

    resolving.add(nodeId)
    let start = today
    let afterBlocker: string | null = null
    for (const blockerId of blockersOf.get(nodeId) ?? []) {
      const blocker = byId.get(blockerId)
      if (blocker === undefined) continue
      const end = resolvedEnd(blocker, ghostOf)
      if (end === null) continue
      const candidate = addDays(end, 1)
      // Only a blocker that actually pushes the start out owns the explanation.
      // One that finished last month leaves `afterBlocker` null and the lane at
      // today, which is the truthful reading: nothing is holding it up any more.
      if (candidate > start) {
        start = candidate
        afterBlocker = blockerId
      }
    }
    resolving.delete(nodeId)

    const span: GanttGhostSpan = {
      start,
      end: addDays(start, GHOST_SPAN_DAYS - 1),
      afterBlocker,
    }
    resolved.set(nodeId, span)
    return span
  }

  const spans = new Map<string, GanttGhostSpan>()
  for (const node of chart.nodes) {
    const span = ghostOf(node.id)
    if (span !== null) spans.set(node.id, span)
  }
  return spans
}
