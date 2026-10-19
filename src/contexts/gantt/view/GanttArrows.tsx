import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { GanttArrow, GanttBar } from '../view-model'
import { pct } from './GanttAxis'
import { ROW_HEIGHT } from './GanttRow'

// The dependency arrows: one absolutely-positioned SVG over the bar region,
// consuming `layout().arrows` and drawing nothing it did not compute.
//
// The re-anchoring, the merging, the self-loop drop and — since the first real
// chart arrived with 54 edges over 30 lanes — **which arrows are drawn at all**
// happened in the view-model (ADR-0012 §10). An arrow whose `focus` is `hidden`
// is not rendered: the default chart draws none of them, selecting a lane draws
// its whole waterfall, and a cycle edge is drawn either way because a plan that
// cannot execute has to look impossible (§6).
//
// What is left here is two decisions:
//
//   - **Percentages for x, pixels for y.** Every segment is axis-aligned, and
//     SVG resolves a percentage on `x1`/`x2` against the viewport — so an elbow
//     route needs no measured width, and a resize is a repaint. A `<path>` would
//     have forced a pixel width and a ResizeObserver with it, which is the thing
//     fractional geometry exists to avoid.
//   - **An arrow needs two bars.** An endpoint with no dates has no position on
//     the time axis, so the arrow is left undrawn rather than parked at day
//     zero, where it would assert a dependency on a date nobody set. The undated
//     lane is already reported by name in "Needs attention".

/** How far past the blocker an arrow turns when it has to double back. */
const BACKTRACK_GAP = 0.012

const MARKER_ID = 'gantt-arrowhead'
const CYCLE_MARKER_ID = 'gantt-arrowhead-cycle'
const WATERFALL_MARKER_ID = 'gantt-arrowhead-waterfall'

/**
 * The merge badge: a filled pill the size of the surface's other chips, held
 * clear of the elbow by `BADGE_GAP` pixels.
 *
 * Both numbers are the fix for a real defect. The count used to be a 9px grey
 * glyph in a `surface-3` circle sitting exactly on the arrow's corner, which in
 * a fully collapsed chart put it on top of a bar's child-span underlay and made
 * it unreadable at a glance — and in a collapsed chart the count *is* the
 * information (ADR-0012 §10). So: a solid fill with a contrasting foreground,
 * 16px like a chip, and offset sideways so it never lands on the corner.
 */
const BADGE_HEIGHT = 16
const BADGE_GAP = 8
/** Extra width per digit past the first, so `12` is a pill rather than a circle. */
const BADGE_DIGIT_WIDTH = 6

export function GanttArrows({
  arrows,
  bars,
  rowTops,
}: {
  arrows: readonly GanttArrow[]
  bars: ReadonlyMap<string, GanttBar>
  /** Each visible row's top offset in pixels, counting open info bands. */
  rowTops: ReadonlyMap<string, number>
}) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
      <defs>
        <Arrowhead id={MARKER_ID} className="fill-ink-tertiary" />
        <Arrowhead id={CYCLE_MARKER_ID} className="fill-destructive" />
        <Arrowhead id={WATERFALL_MARKER_ID} className="fill-primary" />
      </defs>
      {arrows
        .filter((arrow) => arrow.focus !== 'hidden')
        .map((arrow) => (
          <Arrow key={arrow.id} arrow={arrow} bars={bars} rowTops={rowTops} />
        ))}
    </svg>
  )
}

function Arrowhead({ id, className }: { id: string; className: string }) {
  return (
    <marker
      id={id}
      markerWidth="6"
      markerHeight="6"
      refX="5"
      refY="3"
      orient="auto"
      markerUnits="strokeWidth"
    >
      <path d="M0,0 L6,3 L0,6 Z" className={className} />
    </marker>
  )
}

function Arrow({
  arrow,
  bars,
  rowTops,
}: {
  arrow: GanttArrow
  bars: ReadonlyMap<string, GanttBar>
  rowTops: ReadonlyMap<string, number>
}) {
  const from = bars.get(arrow.from)
  const to = bars.get(arrow.to)
  const fromTop = rowTops.get(arrow.from)
  const toTop = rowTops.get(arrow.to)
  if (from === undefined || to === undefined || fromTop === undefined || toTop === undefined) {
    return null
  }

  const startX = from.x + from.width
  const endX = to.x
  // Forward is the common case and gets the midpoint elbow. Backward — a blocker
  // that ends after the lane waiting on it begins — turns just past the blocker
  // instead, which is a readable shape rather than a line doubling back over
  // its own bar.
  const elbowX = endX >= startX ? (startX + endX) / 2 : startX + BACKTRACK_GAP
  const startY = fromTop + ROW_HEIGHT / 2
  const endY = toTop + ROW_HEIGHT / 2

  // A waterfall arrow is the one the reader just asked for, so it gets the
  // accent and a heavier stroke; a cycle arrow drawn without a selection is a
  // standing warning rather than an answer, so it stays destructive-red.
  const stroke = arrow.inCycle
    ? 'stroke-destructive'
    : arrow.focus === 'waterfall'
      ? 'stroke-primary'
      : 'stroke-ink-tertiary'
  const marker = arrow.inCycle
    ? CYCLE_MARKER_ID
    : arrow.focus === 'waterfall'
      ? WATERFALL_MARKER_ID
      : MARKER_ID
  const weight = arrow.focus === 'waterfall' ? 'stroke-[1.75]' : 'stroke-[1.25]'

  return (
    <g
      data-testid={testIds.ganttArrow}
      data-from={arrow.from}
      data-to={arrow.to}
      data-count={arrow.count}
      data-cycle={arrow.inCycle}
      data-focus={arrow.focus}
      style={{ pointerEvents: 'stroke' }}
    >
      <title>{describe(arrow)}</title>
      <line
        x1={pct(startX)}
        y1={startY}
        x2={pct(elbowX)}
        y2={startY}
        className={cn(stroke, weight)}
        strokeDasharray={arrow.inCycle ? '3 3' : undefined}
      />
      <line
        x1={pct(elbowX)}
        y1={startY}
        x2={pct(elbowX)}
        y2={endY}
        className={cn(stroke, weight)}
        strokeDasharray={arrow.inCycle ? '3 3' : undefined}
      />
      <line
        x1={pct(elbowX)}
        y1={endY}
        x2={pct(endX)}
        y2={endY}
        className={cn(stroke, weight)}
        strokeDasharray={arrow.inCycle ? '3 3' : undefined}
        markerEnd={`url(#${marker})`}
      />
      {arrow.count > 1 && <MergeCount arrow={arrow} x={elbowX} y={(startY + endY) / 2} />}
    </g>
  )
}

/**
 * How many edges this one arrow stands for. Three features of PRD A waiting on
 * PRD B is one arrow labelled 3, not three arrows drawn on top of each other —
 * which is what makes collapse *summarise* dependencies instead of hiding them.
 */
function MergeCount({ arrow, x, y }: { arrow: GanttArrow; x: number; y: number }) {
  const label = String(arrow.count)
  const width = BADGE_HEIGHT + (label.length - 1) * BADGE_DIGIT_WIDTH
  return (
    // One group, translated in **pixels** from a percentage origin: `x` is a
    // fraction of the bar region and the gap is not, so the offset has to be a
    // transform rather than arithmetic on the coordinate.
    <g transform={`translate(${BADGE_GAP}, 0)`}>
      <rect
        x={pct(x)}
        y={y - BADGE_HEIGHT / 2}
        width={width}
        height={BADGE_HEIGHT}
        rx={BADGE_HEIGHT / 2}
        className={
          arrow.inCycle
            ? 'fill-destructive'
            : arrow.focus === 'waterfall'
              ? 'fill-primary'
              : 'fill-ink-subtle'
        }
      />
      {/* `dx` centres the text over the pill: the rect starts at `x`, so the
          anchor has to move half a pill's width to the right of it. */}
      <text
        x={pct(x)}
        dx={width / 2}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className={cn(
          'text-[10px] font-semibold tabular-nums',
          arrow.inCycle ? 'fill-destructive-foreground' : 'fill-background',
        )}
      >
        {label}
      </text>
    </g>
  )
}

function describe(arrow: GanttArrow): string {
  const relation = `${arrow.from} blocks ${arrow.to}`
  const merged =
    arrow.count > 1 ? ` — ${arrow.count} dependencies: ${arrow.edgeIds.join(', ')}` : ''
  return `${relation}${merged}${arrow.inCycle ? ' (in a cycle)' : ''}`
}
