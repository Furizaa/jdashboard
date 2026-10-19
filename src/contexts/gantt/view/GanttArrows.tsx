import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { GanttArrow, GanttBar } from '../view-model'
import { pct } from './GanttAxis'
import { ROW_HEIGHT } from './GanttRow'

// The dependency arrows: one absolutely-positioned SVG over the bar region,
// consuming `layout().arrows` and drawing nothing it did not compute.
//
// The re-anchoring, the merging and the self-loop drop all happened in the
// view-model (ADR-0012 §10). What is left here is two decisions:
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
      </defs>
      {arrows.map((arrow) => (
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

  const stroke = arrow.inCycle ? 'stroke-destructive' : 'stroke-ink-tertiary'
  const marker = arrow.inCycle ? CYCLE_MARKER_ID : MARKER_ID

  return (
    <g
      data-testid={testIds.ganttArrow}
      data-from={arrow.from}
      data-to={arrow.to}
      data-count={arrow.count}
      data-cycle={arrow.inCycle}
      style={{ pointerEvents: 'stroke' }}
    >
      <title>{describe(arrow)}</title>
      <line
        x1={pct(startX)}
        y1={startY}
        x2={pct(elbowX)}
        y2={startY}
        className={cn(stroke, 'stroke-[1.25]')}
        strokeDasharray={arrow.inCycle ? '3 3' : undefined}
      />
      <line
        x1={pct(elbowX)}
        y1={startY}
        x2={pct(elbowX)}
        y2={endY}
        className={cn(stroke, 'stroke-[1.25]')}
        strokeDasharray={arrow.inCycle ? '3 3' : undefined}
      />
      <line
        x1={pct(elbowX)}
        y1={endY}
        x2={pct(endX)}
        y2={endY}
        className={cn(stroke, 'stroke-[1.25]')}
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
  return (
    <>
      <circle
        cx={pct(x)}
        cy={y}
        r={7}
        className={cn('fill-surface-3', arrow.inCycle ? 'stroke-destructive' : 'stroke-border')}
        strokeWidth={1}
      />
      <text
        x={pct(x)}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-ink-subtle text-[9px] font-medium"
      >
        {arrow.count}
      </text>
    </>
  )
}

function describe(arrow: GanttArrow): string {
  const relation = `${arrow.from} blocks ${arrow.to}`
  const merged =
    arrow.count > 1 ? ` — ${arrow.count} dependencies: ${arrow.edgeIds.join(', ')}` : ''
  return `${relation}${merged}${arrow.inCycle ? ' (in a cycle)' : ''}`
}
