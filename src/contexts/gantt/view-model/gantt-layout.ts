import type { GanttChart, GanttNode } from '~/kernel'
import {
  blockedStateFor,
  buildTree,
  childSpanFor,
  datedExtentOf,
  datedSpanOf,
  findCycles,
  NO_PROGRESS,
  progressFor,
  visibleRows,
  type GanttBlockedState,
  type GanttCycle,
  type GanttProgress,
  type GanttTree,
} from '../domain'
import { axisFor, place, ticksFor, toDay, type GanttTick, type GanttZoom } from './gantt-axis'

// The Gantt's whole geometry, as one pure function.
//
// This is ADR-0003's claim at its strongest (ADR-0012 §10): a Gantt layout — the
// hardest-looking thing in the application — is an ordinary function of a chart
// and a viewport, table-testable, with no React import anywhere in it or in the
// domain beneath it. A Gantt *library* was rejected partly because it would take
// the demonstration away, and `gantt-view-model-only-imports-kernel-and-domain`
// is what keeps the claim enforceable rather than aspirational.
//
// Positions are fractions of the axis rather than pixels — see `gantt-axis.ts`,
// which owns the time dimension and every date-to-number conversion in it.
//
// **Row windowing is designed for from inception.** `visibleRange` narrows which
// rows come back; it never changes what an arrow points at, because arrows are
// re-anchored over the *whole* visible row set before the window is taken. A
// forty-node chart is fine and a three-hundred-node chart is not, and when that
// day comes the change is to one caller rather than to this function.

export type GanttRow = {
  readonly node: GanttNode
  /** Position in the **full** row list, so a windowed row still knows its grid line. */
  readonly index: number
  readonly depth: number
  readonly hasChildren: boolean
  readonly collapsed: boolean
  /** No dates, so no bar — the row renders dimmed in the tree (ADR-0012 §4). */
  readonly undated: boolean
  readonly blocked: GanttBlockedState
  readonly progress: GanttProgress
  readonly infoExpanded: boolean
}

export type GanttBar = {
  readonly nodeId: string
  readonly x: number
  readonly width: number
  readonly column: GanttNode['column']
  readonly blocked: GanttBlockedState
}

/** The derived underlay: where this lane's dated descendants actually sit. */
export type GanttChildSpanBar = {
  readonly nodeId: string
  readonly x: number
  readonly width: number
  readonly overflow: boolean
}

export type GanttArrow = {
  /** The re-anchored pair, which is what makes a merged arrow one arrow. */
  readonly id: string
  readonly from: string
  readonly to: string
  /** How many edges this arrow stands for. `1` unless collapse merged them. */
  readonly count: number
  readonly edgeIds: readonly string[]
  readonly inCycle: boolean
}

export type GanttNeedsAttention = {
  /** Nodes with no dates. Each array is both the count (`.length`) and the ids. */
  readonly undated: readonly string[]
  readonly unplacedAtRoot: readonly string[]
  readonly orphaned: readonly string[]
  /** Nodes needing attention for any of the three reasons, counted once. */
  readonly total: number
}

export type GanttLayoutOptions = {
  readonly zoom: GanttZoom
  readonly collapsed: ReadonlySet<string>
  readonly expandedInfo: ReadonlySet<string>
  /** Row windowing. `count` beyond the end is not an error — it is the last page. */
  readonly visibleRange: { readonly first: number; readonly count: number }
  /** `YYYY-MM-DD`. Injected, never read from the clock: this function is pure. */
  readonly today: string
}

export type GanttLayout = {
  readonly ticks: readonly GanttTick[]
  /** The today line, or `null` when today falls outside the chart's axis. */
  readonly todayX: number | null
  readonly rows: readonly GanttRow[]
  /** Rows before windowing — what the scroll area is sized by. */
  readonly totalRows: number
  readonly bars: ReadonlyMap<string, GanttBar>
  readonly childSpans: ReadonlyMap<string, GanttChildSpanBar>
  readonly arrows: readonly GanttArrow[]
  readonly cycles: readonly GanttCycle[]
  readonly needsAttention: GanttNeedsAttention
}

// ---------------------------------------------------------------------------
// Arrows
// ---------------------------------------------------------------------------

/**
 * The nearest ancestor a reader can actually see, or `null` when the node has
 * been windowed out of a tree it is not even in.
 *
 * This walks `tree.parentOf` — the *effective* parent, after `buildTree` has
 * re-rooted a dangling `parentId` — and it walks the **whole** tree. Windowing
 * must not change what an arrow points at.
 */
function nearestVisible(
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
function arrowsFor(
  chart: GanttChart,
  tree: GanttTree,
  visible: ReadonlySet<string>,
  inCycle: ReadonlySet<string>,
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
  return [...merged].map(([id, arrow]) => ({
    id,
    from: arrow.from,
    to: arrow.to,
    count: arrow.edgeIds.length,
    edgeIds: arrow.edgeIds,
    inCycle: arrow.inCycle,
  }))
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

/**
 * The three things a chart can be waiting on a human — or an agent — to fix, so
 * one header can state all three (ADR-0012 §4).
 *
 * `unplacedAtRoot` is the judgement call. A root lane someone *chose* to put
 * there is not unplaced, so what counts is a root lane nobody chose: a node
 * whose `parentId` named a node that is not in the chart, and a childless
 * **jira** node still sitting where import dropped it. A jira lane at the root
 * with children under it is doing a PRD lane's job and is left alone.
 */
function needsAttentionFor(chart: GanttChart, tree: GanttTree): GanttNeedsAttention {
  const undated: string[] = []
  const unplacedAtRoot: string[] = []
  const orphaned: string[] = []
  for (const node of chart.nodes) {
    if (datedSpanOf(node) === null) undated.push(node.id)
    if (node.orphaned) orphaned.push(node.id)
    const atRoot = (tree.parentOf.get(node.id) ?? null) === null
    const childless = (tree.byId.get(node.id)?.children.length ?? 0) === 0
    if (atRoot && (tree.reRooted.has(node.id) || (node.source.kind === 'jira' && childless))) {
      unplacedAtRoot.push(node.id)
    }
  }
  return {
    undated,
    unplacedAtRoot,
    orphaned,
    total: new Set([...undated, ...unplacedAtRoot, ...orphaned]).size,
  }
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

/**
 * A chart and a viewport in; everything the views need out.
 *
 * The order matters and is the one thing worth reading twice: the tree, the
 * derived facts and the arrows are computed over the **whole** chart, and only
 * then is `visibleRange` applied to the rows. Narrowing the window changes which
 * rows come back and nothing else — not an arrow endpoint, not a count, not a
 * cycle, not the axis.
 */
export function layout(chart: GanttChart, opts: GanttLayoutOptions): GanttLayout {
  const tree = buildTree(chart.nodes)
  const rows = visibleRows(tree, opts.collapsed)
  const visible = new Set(rows.map((row) => row.node.id))

  const todayDay = toDay(opts.today)
  const axis = axisFor(datedExtentOf(chart.nodes), opts.zoom, todayDay)
  const inAxis = todayDay >= axis.start && todayDay <= axis.end

  const blocked = blockedStateFor(chart)
  const progress = progressFor(tree)
  const childSpans = childSpanFor(tree)
  const { cycles, edgeIds } = findCycles(chart)

  // Sliced *before* the per-row work, not after: windowing exists so that a
  // three-hundred-node chart costs what a screenful costs.
  const first = Math.max(0, opts.visibleRange.first)
  const windowed = rows
    .slice(first, first + Math.max(0, opts.visibleRange.count))
    .map((row, offset) => ({ row, index: first + offset }))

  const bars = new Map<string, GanttBar>()
  const spans = new Map<string, GanttChildSpanBar>()
  const laidOut = windowed.map(({ row, index }): GanttRow => {
    const own = datedSpanOf(row.node)
    if (own !== null) {
      bars.set(row.node.id, {
        nodeId: row.node.id,
        ...place(own, axis),
        column: row.node.column,
        blocked: blocked.get(row.node.id) ?? 'none',
      })
    }
    const childSpan = childSpans.get(row.node.id) ?? null
    if (childSpan !== null) {
      spans.set(row.node.id, {
        nodeId: row.node.id,
        ...place(childSpan, axis),
        overflow: childSpan.overflow,
      })
    }
    return {
      node: row.node,
      index,
      depth: row.depth,
      hasChildren: row.hasChildren,
      collapsed: row.collapsed,
      undated: own === null,
      blocked: blocked.get(row.node.id) ?? 'none',
      progress: progress.get(row.node.id) ?? NO_PROGRESS,
      infoExpanded: opts.expandedInfo.has(row.node.id),
    }
  })

  return {
    ticks: ticksFor(axis, opts.zoom),
    // The middle of today rather than its leading edge, so the line reads as
    // "now" rather than as the boundary between yesterday and today.
    todayX: inAxis ? (todayDay - axis.start + 0.5) / axis.days : null,
    rows: laidOut,
    totalRows: rows.length,
    bars,
    childSpans: spans,
    arrows: arrowsFor(chart, tree, visible, edgeIds),
    cycles,
    needsAttention: needsAttentionFor(chart, tree),
  }
}
