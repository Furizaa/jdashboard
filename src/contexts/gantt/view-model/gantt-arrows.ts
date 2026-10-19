import type { GanttChart } from '~/kernel'
import type { GanttTree } from '../domain'

// The dependency arrows: which edges exist once collapse has been accounted for,
// and which of them are drawn.
//
// Split out of `gantt-layout.ts` for the same reason `gantt-axis.ts` was — it is
// a dimension of its own. That file answers "which lanes, in what order"; the axis
// answers "over what stretch of time"; this one answers "what waits on what, and
// which of that does the reader want to see". It also stops the layout file
// drifting past the repo's four-hundred-line ceiling, which the waterfall was
// what finally pushed it through.
//
// Pure: no React, no DOM, no clock. Positions are not computed here at all —
// an arrow is a pair of node ids, and `GanttArrows.tsx` turns the pair into a
// route using the bars the layout already placed.

export type GanttArrow = {
  /** The re-anchored pair, which is what makes a merged arrow one arrow. */
  readonly id: string
  readonly from: string
  readonly to: string
  /** How many edges this arrow stands for. `1` unless collapse merged them. */
  readonly count: number
  readonly edgeIds: readonly string[]
  readonly inCycle: boolean
  /**
   * Whether this arrow is drawn, and on whose account.
   *
   * The first real chart settled this: 54 edges over 30 lanes drew a thicket
   * nobody could read a single dependency out of, so the honest default is to
   * draw **none** of them and let the reader ask. Selecting a lane shows its
   * whole waterfall — everything upstream and everything downstream, transitively
   * — and that is `'waterfall'`.
   *
   * `'cycle'` is the exception that is never hidden. ADR-0012 §6 requires a plan
   * that cannot execute to *look* impossible, and an edge the reader has to
   * discover by clicking is not that. A cycle edge inside the selected waterfall
   * reports as `'waterfall'`; `inCycle` is what still makes it dashed.
   */
  readonly focus: 'hidden' | 'cycle' | 'waterfall'
}

/**
 * The nearest ancestor a reader can actually see, or `null` when the node has
 * been windowed out of a tree it is not even in.
 *
 * This walks `tree.parentOf` — the *effective* parent, after `buildTree` has
 * re-rooted a dangling `parentId` — and it walks the **whole** tree. Windowing
 * must not change what an arrow points at.
 */
export function nearestVisible(
  nodeId: string,
  tree: GanttTree,
  visible: ReadonlySet<string>,
): string | null {
  let current: string | null = nodeId
  const seen = new Set<string>()
  while (current !== null && !seen.has(current)) {
    if (visible.has(current)) return current
    seen.add(current)
    current = tree.parentOf.get(current) ?? null
  }
  return null
}

/**
 * Edges re-anchored onto the visible row set (ADR-0012 §10).
 *
 * Collapse then **summarises** dependencies rather than concealing them, and a
 * fully collapsed chart becomes a PRD-level dependency graph — arguably the most
 * useful view of all. Two rules do the summarising:
 *
 * - An arrow whose endpoints re-anchor to the **same** node is dropped. Two
 *   children of one collapsed parent waiting on each other is a self-loop, and a
 *   self-arrow communicates nothing.
 * - Arrows landing on the same ordered pair **merge**, carrying a `count`. Three
 *   features of PRD A waiting on PRD B is one arrow labelled 3, not three
 *   arrows drawn on top of each other.
 */
export function arrowsFor(
  chart: GanttChart,
  tree: GanttTree,
  visible: ReadonlySet<string>,
  inCycle: ReadonlySet<string>,
  selection: string | null,
): readonly GanttArrow[] {
  const merged = new Map<
    string,
    { from: string; to: string; edgeIds: string[]; inCycle: boolean }
  >()
  for (const edge of chart.edges) {
    const from = nearestVisible(edge.from, tree, visible)
    const to = nearestVisible(edge.to, tree, visible)
    if (from === null || to === null || from === to) continue
    const id = `${from}→${to}`
    const existing = merged.get(id)
    if (existing === undefined) {
      merged.set(id, { from, to, edgeIds: [edge.id], inCycle: inCycle.has(edge.id) })
      continue
    }
    existing.edgeIds.push(edge.id)
    existing.inCycle ||= inCycle.has(edge.id)
  }
  const pairs = [...merged.values()]
  const waterfall = waterfallOf(pairs, selection)
  return [...merged].map(([id, arrow]) => ({
    id,
    from: arrow.from,
    to: arrow.to,
    count: arrow.edgeIds.length,
    edgeIds: arrow.edgeIds,
    inCycle: arrow.inCycle,
    focus:
      waterfall.has(arrow.from) && waterfall.has(arrow.to)
        ? ('waterfall' as const)
        : arrow.inCycle
          ? ('cycle' as const)
          : ('hidden' as const),
  }))
}

/**
 * Every lane reachable from the selected one through `blocks` edges, in **both**
 * directions and transitively — the "full waterfall from and to this block".
 *
 * Both directions because the two questions a reader clicks a lane to ask are
 * "what is holding this up" and "what is waiting on this", and answering only one
 * of them would make the click mean something the reader has to remember. The
 * closure is taken over the **re-anchored** pairs rather than over `chart.edges`,
 * so the waterfall respects collapse exactly as the drawing does: fold a PRD and
 * its features' dependencies become the PRD's, which is the same summarising
 * rule arrow merging already follows.
 *
 * The empty set when nothing is selected is what hides every arrow — the default
 * (ADR-0012 §10's amendment), because 54 edges over 30 lanes is a thicket rather
 * than a dependency graph.
 */
function waterfallOf(
  pairs: readonly { readonly from: string; readonly to: string }[],
  selection: string | null,
): ReadonlySet<string> {
  if (selection === null) return new Set()
  // Two **directed** walks, then unioned — not one undirected one. Following
  // edges without regard to direction would pull in every lane that merely
  // shares a blocker with something in the chain, which on a graph this dense is
  // the whole chart: selecting a lane would redraw the thicket the default is
  // hiding. Walking each direction with its own visited set matters too — one
  // shared set would let the downstream walk mark a lane that is also upstream
  // (possible when the selection sits in a cycle) and the upstream walk would
  // then stop at it and lose what blocks it.
  const downstream = reachableFrom(adjacency(pairs, 'from', 'to'), selection)
  const upstream = reachableFrom(adjacency(pairs, 'to', 'from'), selection)
  return new Set([selection, ...downstream, ...upstream])
}

/** The pairs as a neighbour list, read in whichever direction the keys name. */
function adjacency(
  pairs: readonly { readonly from: string; readonly to: string }[],
  key: 'from' | 'to',
  value: 'from' | 'to',
): ReadonlyMap<string, readonly string[]> {
  const neighbours = new Map<string, string[]>()
  for (const pair of pairs) {
    const existing = neighbours.get(pair[key])
    if (existing === undefined) neighbours.set(pair[key], [pair[value]])
    else existing.push(pair[value])
  }
  return neighbours
}

/**
 * Breadth-first from one node. The visited set is what makes this terminate on a
 * chart that contains a cycle — which this one is explicitly allowed to
 * (ADR-0012 §6).
 */
function reachableFrom(
  neighbours: ReadonlyMap<string, readonly string[]>,
  start: string,
): ReadonlySet<string> {
  const seen = new Set<string>([start])
  const queue = [start]
  while (queue.length > 0) {
    const current = queue.shift() ?? ''
    for (const neighbour of neighbours.get(current) ?? []) {
      if (seen.has(neighbour)) continue
      seen.add(neighbour)
      queue.push(neighbour)
    }
  }
  return seen
}
