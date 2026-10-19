import type { GanttChart, GanttNode } from '~/kernel'
import {
  axisExtentOf,
  blockedStateFor,
  buildTree,
  childSpanFor,
  datedSpanOf,
  findCycles,
  ghostSpansFor,
  NO_PROGRESS,
  openSpanOf,
  progressFor,
  visibleRows,
  type GanttBlockedState,
  type GanttCycle,
  type GanttOpenSpan,
  type GanttProgress,
  type GanttGhostSpan,
  type GanttSpan,
} from '../domain'
import { arrowsFor, nearestVisible, type GanttArrow } from './gantt-arrows'
import { needsAttentionFor, type GanttNeedsAttention } from './gantt-needs-attention'
import {
  axisFor,
  axisWidthOf,
  place,
  placeOpen,
  ticksFor,
  toDay,
  type GanttAxis,
  type GanttTick,
  type GanttZoom,
} from './gantt-axis'

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
  /**
   * **No start at all** — the row renders dimmed in the tree (ADR-0012 §4).
   *
   * No longer "and therefore no bar": a childless undated lane now gets a
   * **ghost** bar (`GanttBar.ghost`), because a chart that draws nothing for its
   * `TO DO` work cannot answer what to work on next. What this still means is
   * that nobody dated the lane, which is what the dimming and the Needs
   * attention count are both about.
   *
   * The stricter of the two readings of "undated". A lane with a start and no
   * end is not undated; it has a bar, an open-ended one, and
   * `GanttBar.openEnded` is what says so.
   */
  readonly undated: boolean
  readonly blocked: GanttBlockedState
  readonly progress: GanttProgress
  readonly infoExpanded: boolean
  /** The lane the reader clicked, whose dependency waterfall the arrows are showing. */
  readonly selected: boolean
  /**
   * This lane is somewhere in the selected lane's waterfall — upstream of it,
   * downstream of it, or the lane itself.
   *
   * `false` on every row while nothing is selected, which is why the view also
   * reads `GanttLayout.selection`: "not in the waterfall" and "there is no
   * waterfall" must not dim the same lanes.
   */
  readonly inWaterfall: boolean
}

export type GanttBar = {
  readonly nodeId: string
  readonly x: number
  readonly width: number
  /**
   * The lane has a start and no forecast end, so `width` runs to today rather
   * than to an end anybody declared.
   *
   * The view draws it **unterminated** — faded out at its right edge instead of
   * stopped by one. A hard edge at today would read as a bar that finishes
   * today, which is a forecast nobody made and the exact assertion leaving `end`
   * null was avoiding.
   */
  readonly openEnded: boolean
  /**
   * Nobody dated this lane; the span is **invented** — one week, placed behind
   * whatever blocks it (`domain/ghost-span.ts`).
   *
   * The view draws it as a dashed outline with no fill, so it reads as a
   * placeholder rather than as a plan. That distinction is the whole licence for
   * drawing it at all: ADR-0012 §4 refuses to fabricate dates, and a ghost does
   * not claim to be one (§4's amendment (ii)).
   */
  readonly ghost: boolean
  /** The blocker a ghost was queued behind, for the view to name. `null` otherwise. */
  readonly afterBlocker: string | null
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

export type GanttLayoutOptions = {
  readonly zoom: GanttZoom
  readonly collapsed: ReadonlySet<string>
  readonly expandedInfo: ReadonlySet<string>
  /** Row windowing. `count` beyond the end is not an error — it is the last page. */
  readonly visibleRange: { readonly first: number; readonly count: number }
  /** `YYYY-MM-DD`. Injected, never read from the clock: this function is pure. */
  readonly today: string
  /**
   * The lane whose dependency waterfall to draw, or `null` to draw no arrows at
   * all bar the cycles. A node id the chart does not have is the same as `null`.
   */
  readonly selected: string | null
}

export type GanttLayout = {
  readonly ticks: readonly GanttTick[]
  /**
   * The bar region's width in pixels — the one pixel number on the whole layout,
   * and the thing the horizontal scroll is sized by.
   *
   * Every position stays a fraction; this is what those fractions resolve
   * against, so a chart wider than the viewport scrolls instead of compressing
   * thirty lanes behind one long one.
   */
  readonly axisWidth: number
  /** The today line, or `null` when today falls outside the chart's axis. */
  readonly todayX: number | null
  readonly rows: readonly GanttRow[]
  /** Rows before windowing — what the scroll area is sized by. */
  readonly totalRows: number
  readonly bars: ReadonlyMap<string, GanttBar>
  readonly childSpans: ReadonlyMap<string, GanttChildSpanBar>
  readonly arrows: readonly GanttArrow[]
  /**
   * The selected lane **re-anchored onto the visible rows**, or `null` when
   * nothing is selected — so selecting a lane and then collapsing its parent
   * keeps the waterfall, drawn from the parent.
   *
   * The view needs the distinction this makes rather than just the row flags: a
   * chart with no selection dims nothing, and a chart with one dims everything
   * outside the waterfall.
   */
  readonly selection: string | null
  readonly cycles: readonly GanttCycle[]
  readonly needsAttention: GanttNeedsAttention
  /**
   * Not one lane on the whole chart can be drawn — nothing dated, nothing even
   * started.
   *
   * A property of the **chart**, not of the window: a chart whose only dated
   * lane is collapsed out of view still has dates. An axis, a today line and a
   * screenful of empty rows reads as a broken chart rather than as one waiting
   * to be dated, so the view says which it is (ADR-0012 §4).
   */
  readonly nothingDated: boolean
}

// ---------------------------------------------------------------------------
// The layout
// ---------------------------------------------------------------------------

/**
 * The axis domain widened to hold the ghost bars as well as the real ones.
 *
 * Separate from `axisExtentOf` rather than folded into it, and the separation is
 * the same one `axisExtentOf` already makes against `datedExtentOf`: the domain
 * has to cover everything that gets **drawn**, while `nothingDated` has to stay a
 * statement about what somebody actually **dated**. Collapsing the two would make
 * a chart of thirty undated lanes report that it has dates, because ghosts gave
 * it an extent.
 */
function withGhosts(
  extent: GanttSpan | null,
  ghosts: ReadonlyMap<string, GanttSpan>,
): GanttSpan | null {
  let widened = extent
  for (const ghost of ghosts.values()) {
    widened =
      widened === null
        ? { start: ghost.start, end: ghost.end }
        : {
            start: widened.start < ghost.start ? widened.start : ghost.start,
            end: widened.end > ghost.end ? widened.end : ghost.end,
          }
  }
  return widened
}

/**
 * Where one lane's bar goes, or `null` when it has none.
 *
 * Fully dated, open-ended, ghosted, or nothing — the four states a lane's own
 * span can be in, and the order below is the precedence: **a real date always
 * beats an invented one.** That ordering is the whole guarantee the ghost rests
 * on, since it is what stops an invented week from ever covering a date somebody
 * set.
 */
function placeBar(
  own: GanttSpan | null,
  open: GanttOpenSpan | null,
  ghost: GanttGhostSpan | null,
  axis: GanttAxis,
  today: number,
): Pick<GanttBar, 'x' | 'width' | 'openEnded' | 'ghost' | 'afterBlocker'> | null {
  if (own !== null) {
    return { ...place(own, axis), openEnded: false, ghost: false, afterBlocker: null }
  }
  if (open !== null) {
    return { ...placeOpen(open, axis, today), openEnded: true, ghost: false, afterBlocker: null }
  }
  if (ghost !== null) {
    return {
      ...place(ghost, axis),
      openEnded: false,
      ghost: true,
      afterBlocker: ghost.afterBlocker,
    }
  }
  return null
}

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
  // An open-ended lane's start counts towards the domain, or a chart of nothing
  // but in-flight work would have no domain to draw its bars on.
  const extent = axisExtentOf(chart.nodes)
  // Ghosts widen the domain too, and they have to: a ghost queued behind the
  // last real bar sits past the plan's own extent by a week, and an axis built
  // without it would clip the very lane the invention exists to make visible.
  const ghosts = ghostSpansFor(chart, tree, opts.today)
  const axis = axisFor(withGhosts(extent, ghosts), opts.zoom, todayDay)
  const inAxis = todayDay >= axis.start && todayDay <= axis.end

  const blocked = blockedStateFor(chart)
  const progress = progressFor(tree)
  const childSpans = childSpanFor(tree)
  const { cycles, edgeIds } = findCycles(chart)
  // A selection the chart no longer has — a lane the agent deleted under a
  // reader who had it selected — is the same as no selection.
  const selection = opts.selected === null ? null : nearestVisible(opts.selected, tree, visible)

  // Sliced *before* the per-row work, not after: windowing exists so that a
  // three-hundred-node chart costs what a screenful costs.
  const first = Math.max(0, opts.visibleRange.first)
  const windowed = rows
    .slice(first, first + Math.max(0, opts.visibleRange.count))
    .map((row, offset) => ({ row, index: first + offset }))

  const arrows = arrowsFor(chart, tree, visible, edgeIds, selection)
  const inWaterfall = new Set(
    arrows.flatMap((arrow) => (arrow.focus === 'waterfall' ? [arrow.from, arrow.to] : [])),
  )
  if (selection !== null) inWaterfall.add(selection)

  const bars = new Map<string, GanttBar>()
  const spans = new Map<string, GanttChildSpanBar>()
  const laidOut = windowed.map(({ row, index }): GanttRow => {
    const own = datedSpanOf(row.node)
    const open = openSpanOf(row.node)
    const placed = placeBar(own, open, ghosts.get(row.node.id) ?? null, axis, todayDay)
    if (placed !== null) {
      bars.set(row.node.id, {
        nodeId: row.node.id,
        ...placed,
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
      // Still "nobody dated this" even when a ghost gives it a bar — the tree
      // cell dims on this and Needs attention counts it, and both are about the
      // missing dates rather than about whether something got drawn.
      undated: own === null && open === null,
      blocked: blocked.get(row.node.id) ?? 'none',
      progress: progress.get(row.node.id) ?? NO_PROGRESS,
      infoExpanded: opts.expandedInfo.has(row.node.id),
      selected: selection === row.node.id,
      inWaterfall: inWaterfall.has(row.node.id),
    }
  })

  return {
    ticks: ticksFor(axis, opts.zoom),
    axisWidth: axisWidthOf(axis, opts.zoom),
    // The middle of today rather than its leading edge, so the line reads as
    // "now" rather than as the boundary between yesterday and today.
    todayX: inAxis ? (todayDay - axis.start + 0.5) / axis.days : null,
    rows: laidOut,
    totalRows: rows.length,
    bars,
    childSpans: spans,
    arrows,
    selection,
    cycles,
    needsAttention: needsAttentionFor(chart, tree),
    nothingDated: extent === null,
  }
}

/**
 * Every ancestor of one lane, nearest first — the lanes a reveal has to unfold
 * before the lane itself can be on screen (the palette's `g` hand-off).
 *
 * Built from `buildTree`'s **effective** parent links rather than from the
 * stored `parentId`s, which is the whole reason it lives beside `layout` instead
 * of being a two-line walk at the call site: a node whose parent is missing was
 * re-rooted and a `parentId` cycle was cut, so the chain that is actually drawn
 * is the only chain worth unfolding. A node the chart does not have yields the
 * empty list rather than throwing — `?node=` is hostile input until proven
 * otherwise, and a stale link should land on the chart, not on an error.
 */
export function ancestorsOf(chart: GanttChart, nodeId: string): readonly string[] {
  const { parentOf } = buildTree(chart.nodes)
  if (!parentOf.has(nodeId)) return []
  const ancestors: string[] = []
  // The forest `buildTree` guarantees means this terminates, but the seen set
  // stays: this walks a map, and a map is cheaper to guard than to trust.
  const seen = new Set<string>([nodeId])
  let current = parentOf.get(nodeId) ?? null
  while (current !== null && !seen.has(current)) {
    ancestors.push(current)
    seen.add(current)
    current = parentOf.get(current) ?? null
  }
  return ancestors
}
