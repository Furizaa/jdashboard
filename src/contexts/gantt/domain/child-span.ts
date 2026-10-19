import type { GanttNode } from '~/kernel'
import type { GanttTree, GanttTreeNode } from './tree'

// The derived underlay: where a lane's children actually sit, drawn under where
// the lane says it sits.
//
// Every node carries its own span, parents included (ADR-0012 §4). A purely
// rolled-up parent cannot express "this PRD is Q4" before it has been
// decomposed, which is the order planning actually happens in — and a freshly
// created PRD would have no bar at all. Drawing both is what makes **slip
// visible**: a PRD whose features have overrun its declared window shows the
// overrun instead of silently absorbing it.
//
// Pure functions over kernel types. No I/O, no time, no framework.

export type GanttSpan = {
  /** `YYYY-MM-DD`, inclusive. Lexicographic order is chronological order. */
  readonly start: string
  readonly end: string
}

/**
 * Work that has begun and that nobody has forecast an end for.
 *
 * `end` is typed `null` rather than omitted so the two span shapes are
 * discriminable, and it stays `null` all the way to the view: substituting today
 * would assert a forecast nobody made, which is precisely what leaving it unset
 * was refusing to do.
 */
export type GanttOpenSpan = {
  readonly start: string
  readonly end: null
}

export type GanttChildSpan = GanttSpan & {
  /**
   * The children leave the node's declared window on one side or the other.
   * One flag rather than two: the underlay is drawn at its real extent, so the
   * side is already on screen — what the flag is for is colouring the overrun,
   * and "this lane has slipped" is one fact.
   *
   * `false` when the node declares no window of its own: nothing to exceed.
   */
  readonly overflow: boolean
}

/**
 * A node's own span, or `null`.
 *
 * **Both** ends are required. Dates are nullable because import makes them so —
 * a chart bootstrapped from an epic has one node per ticket and no dates at all
 * — and a bar needs two ends to be drawn, so a half-dated node is as undated as
 * an undated one. The alternative is inventing the missing end, which is
 * fabricating a plan nobody made.
 */
export function datedSpanOf(node: GanttNode): GanttSpan | null {
  if (node.start === null || node.end === null) return null
  return { start: node.start, end: node.end }
}

/**
 * A node's span when it has a start and **no** end, or `null`.
 *
 * The state `datedSpanOf` deliberately refuses to name, given a name of its own
 * — because a lane that demonstrably began on a known day is not undated, and
 * collapsing the two draws a known start as a blank row. Dates seeded from a
 * ticket's status history are exactly this shape: a real `start` from the first
 * transition out of `TO DO`, and `end` left null for work still in flight.
 *
 * The two functions are mutually exclusive and neither is the other's fallback:
 * a node is fully dated, open-ended, or undated, and nothing is both.
 */
export function openSpanOf(node: GanttNode): GanttOpenSpan | null {
  if (node.start === null || node.end !== null) return null
  return { start: node.start, end: null }
}

/** The extent covering both spans. */
function union(a: GanttSpan, b: GanttSpan): GanttSpan {
  return {
    start: a.start < b.start ? a.start : b.start,
    end: a.end > b.end ? a.end : b.end,
  }
}

/**
 * Per node, the extent of its **dated descendants**, or `null` when it has none.
 *
 * Descendants at every depth, not just leaves — unlike `progressFor`, where
 * counting both altitudes would double-count. Here the question is "how far does
 * the work under this lane reach", and a dated intermediate lane is part of the
 * answer. Undated descendants contribute nothing rather than contributing the
 * parent's own dates, which is the whole point of the flag: an undecomposed
 * quarter and a quarter whose features are all undated must not look alike.
 */
export function childSpanFor(tree: GanttTree): ReadonlyMap<string, GanttChildSpan | null> {
  const spans = new Map<string, GanttChildSpan | null>()

  /** The extent of this node *and* everything under it — what a parent unions in. */
  const walk = (treeNode: GanttTreeNode): GanttSpan | null => {
    let children: GanttSpan | null = null
    for (const child of treeNode.children) {
      const subtree = walk(child)
      if (subtree !== null) children = children === null ? subtree : union(children, subtree)
    }

    const own = datedSpanOf(treeNode.node)
    spans.set(
      treeNode.node.id,
      children === null
        ? null
        : {
            ...children,
            overflow: own !== null && (children.start < own.start || children.end > own.end),
          },
    )

    if (own === null) return children
    return children === null ? own : union(own, children)
  }

  for (const root of tree.roots) walk(root)
  return spans
}

/**
 * The extent every dated node in the chart falls inside, or `null` when none is
 * dated. The axis domain is padded out from this (`view-model/gantt-layout`),
 * and the opening zoom is chosen from its length (`view-model/gantt-state`).
 */
export function datedExtentOf(nodes: readonly GanttNode[]): GanttSpan | null {
  let extent: GanttSpan | null = null
  for (const node of nodes) {
    const span = datedSpanOf(node)
    if (span !== null) extent = extent === null ? span : union(extent, span)
  }
  return extent
}

/**
 * The extent the **axis domain** is built from: every dated node's span, plus
 * every open-ended node's start.
 *
 * Wider than `datedExtentOf`, and separate from it rather than replacing it,
 * because the two answer different questions. A chart of nothing but in-flight
 * work has no dated extent at all, and an axis derived from that would have no
 * domain for the very bars it has to draw.
 *
 * An open-ended node contributes **its start as a single day**, not a span
 * reaching to today. Padding the domain out to the clock would make "today is
 * past the axis" unreachable, and the axis is a property of the plan rather than
 * of when it is being read.
 */
export function axisExtentOf(nodes: readonly GanttNode[]): GanttSpan | null {
  let extent = datedExtentOf(nodes)
  for (const node of nodes) {
    const open = openSpanOf(node)
    if (open === null) continue
    const begun: GanttSpan = { start: open.start, end: open.start }
    extent = extent === null ? begun : union(extent, begun)
  }
  return extent
}
