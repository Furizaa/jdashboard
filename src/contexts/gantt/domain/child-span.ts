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
