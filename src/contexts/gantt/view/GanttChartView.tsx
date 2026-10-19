import { useEffect, useMemo, useRef } from 'react'
import { match } from 'ts-pattern'
import { ChevronLeft } from 'lucide-react'
import type { GanttNodeView } from '~/kernel'
import { cn } from '~/lib/cn'
import { useGanttChart, useNodeReveal, type GanttChartApi } from '../presenter'
import type { GanttLayout } from '../view-model'
import { ChartHeader } from './GanttChartHeader'
import { CycleWarning } from './CycleWarning'
import { GanttArrows } from './GanttArrows'
import { GanttAxis, GanttGridLines } from './GanttAxis'
import {
  GanttChartRow,
  BAR_REGION_CLASS,
  ROW_HEIGHT,
  TREE_COLUMN_CLASS,
  TREE_COLUMN_WIDTH,
} from './GanttRow'
import { INFO_BAND_HEIGHT } from './InfoBand'
import { NoDatesBanner } from './NoDatesBanner'

// The grid frame: CSS grid rows, absolutely positioned bars, one SVG arrow
// overlay (ADR-0012 §10).
//
// A Gantt library was rejected because it would own layout and interaction
// state, so the recursive tree, the inline info band, read-only mode and the
// segmented progress bars would each become a fight with its model. What is left
// here is composition — this file computes nothing about the chart. Every
// position comes from `layout()`, and the only arithmetic below is turning a
// visible row's position into a pixel offset the arrow overlay can share.
//
// **The chart scrolls in both directions, inside one container.** It used to
// scroll only vertically, with the axis sized to whatever the window happened to
// be — so a chart holding one fourteen-week lane squeezed its other thirty into a
// few pixels each and all three zooms drew the same unreadable picture. Now
// `layout().axisWidth` gives the time axis an intrinsic width, the tree column
// and the axis strip are `sticky`, and zoom changes density rather than only tick
// labels. Positions stay fractions of the bar region, so nothing else moved.
//
// **Nothing here mutates the chart.** Expand, collapse, zoom, select and read;
// the agent is the only writer (ADR-0012 §8), so there is no control on this
// surface that a reader could mistake for one.

export type GanttChartViewProps = {
  readonly chartId: string
  readonly onBack: () => void
  /**
   * The lane `?node=` asked for, if any — the palette's `g` hand-off. Consumed
   * on arrival via `onNodeConsumed`, so a refresh does not re-reveal it.
   */
  readonly revealNodeId: string | undefined
  readonly onNodeConsumed: () => void
  /** Opens the real ticket reader over the chart, by setting `?issue=`. */
  readonly onOpenIssue: (issueKey: string) => void
}

export function GanttChartView({
  chartId,
  onBack,
  revealNodeId,
  onNodeConsumed,
  onOpenIssue,
}: GanttChartViewProps) {
  const api = useGanttChart(chartId)

  return match(api)
    .with({ phase: 'loading' }, () => <FrameMessage onBack={onBack}>Reading chart…</FrameMessage>)
    .with({ phase: 'missing' }, ({ chartId: missing }) => (
      <FrameMessage onBack={onBack}>
        There is no chart called <span className="text-foreground font-mono">{missing}</span>.
      </FrameMessage>
    ))
    .with({ phase: 'error' }, ({ message }) => (
      <FrameMessage onBack={onBack} tone="destructive">
        {message}
      </FrameMessage>
    ))
    .with({ phase: 'ready' }, (ready) => (
      <Chart
        api={ready}
        onBack={onBack}
        revealNodeId={revealNodeId}
        onNodeConsumed={onNodeConsumed}
        onOpenIssue={onOpenIssue}
      />
    ))
    .exhaustive()
}

type ReadyApi = Extract<GanttChartApi, { phase: 'ready' }>

function Chart({
  api,
  onBack,
  revealNodeId,
  onNodeConsumed,
  onOpenIssue,
}: Omit<GanttChartViewProps, 'chartId'> & { api: ReadyApi }) {
  const { layout: laidOut, chart } = api
  // Mounted only once the chart is ready, which is what makes "unfold the
  // ancestors" possible at all — there is no tree to walk before then.
  useNodeReveal(revealNodeId ?? null, api.reveal, onNodeConsumed)
  const nodesById = useMemo(
    () => new Map(chart.nodes.map((node) => [node.id, node] as const)),
    [chart.nodes],
  )
  const rowTops = useMemo(() => rowTopsOf(laidOut), [laidOut])
  const scroller = useOpenAtToday(api.chartId, laidOut)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartHeader api={api} onBack={onBack} />
      <CycleWarning cycles={laidOut.cycles} titleOf={api.titleOf} />
      {/* After the cycle warning: a plan that cannot execute is the more urgent
          of the two, and an undated chart is not a fault at all. */}
      {laidOut.nothingDated && <NoDatesBanner chartId={api.chartId} />}
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
        {/* `max(100%, …)` rather than a plain width: the axis is as wide as the
            zoom asks for, and at least as wide as the window, so a short chart
            fills the frame and a long one scrolls. The `100%` is resolved by the
            browser against the scroll container — which is why the chart still
            needs no ResizeObserver to know how wide it is. */}
        <div
          className="relative flex min-h-full flex-col"
          style={{ width: `max(100%, ${TREE_COLUMN_WIDTH + laidOut.axisWidth}px)` }}
        >
          {/* The axis strip sticks to the top so it stays put while the lanes
              scroll, and its left spacer sticks to the left — exactly the tree
              column's width — so the two corners agree at every scroll offset. */}
          <div className="border-border bg-background sticky top-0 z-30 flex shrink-0 border-b">
            <div
              className={cn(
                'border-border/60 bg-background sticky left-0 z-10 shrink-0 border-r',
                TREE_COLUMN_CLASS,
              )}
            />
            <GanttAxis ticks={laidOut.ticks} todayX={laidOut.todayX} />
          </div>
          {/* `flex-1` so the gridlines and the today line carry on past the last
              lane rather than stopping in mid-air on a short chart. */}
          <div className="relative flex-1">
            <div className={cn('absolute inset-y-0 z-0', BAR_REGION_CLASS)}>
              <GanttGridLines ticks={laidOut.ticks} todayX={laidOut.todayX} />
            </div>
            {/* Under the lanes, not over them: a bar and an open info band are
                opaque, so an arrow passing through one goes behind it rather than
                being drawn across a PRD someone is reading. */}
            <div className={cn('pointer-events-none absolute inset-y-0 z-[1]', BAR_REGION_CLASS)}>
              <GanttArrows arrows={laidOut.arrows} bars={laidOut.bars} rowTops={rowTops} />
            </div>
            <div className="relative z-10">
              {laidOut.rows.map((row) => (
                <GanttChartRow
                  key={row.node.id}
                  row={row}
                  node={nodesById.get(row.node.id) ?? withoutBody(row.node)}
                  chartId={api.chartId}
                  bar={laidOut.bars.get(row.node.id)}
                  childSpan={laidOut.childSpans.get(row.node.id)}
                  revealed={api.revealed === row.node.id}
                  dimmed={laidOut.selection !== null && !row.inWaterfall}
                  onToggleCollapse={() => api.toggleCollapse(row.node.id)}
                  onToggleInfo={() => api.toggleInfo(row.node.id)}
                  onToggleSelection={() => api.toggleSelection(row.node.id)}
                  onOpenIssue={onOpenIssue}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Where to put today when the chart opens — a fifth in, so the past is reachable. */
const TODAY_VIEWPORT_FRACTION = 0.2

/**
 * Open the chart on **today** rather than on the far left of the padded axis.
 *
 * Now that the axis extends past the plan on both sides and can be several
 * screens wide, "scrolled to the earliest date in the programme" is the wrong
 * first view: the question a Gantt is opened for is where things are *now*. Today
 * is placed a fifth of the way in rather than at the edge, so the weeks just gone
 * are on screen without scrolling back.
 *
 * An effect rather than a render-time position because it is a DOM write to an
 * element that does not exist until after the first paint — the same category as
 * the revealed row's `scrollIntoView`, and the reason `use-node-reveal.ts` is a
 * hook too. It runs once per chart, not on every zoom: re-anchoring under a
 * reader who has scrolled somewhere deliberately would be the surface arguing
 * with them.
 */
function useOpenAtToday(chartId: string, laidOut: GanttLayout) {
  const ref = useRef<HTMLDivElement>(null)
  // Which chart has already been anchored. A **ref rather than a narrower
  // dependency array**: `todayX` and `axisWidth` change with every zoom, so
  // leaving them out would be a lie about what the effect reads, and depending on
  // them would yank a reader who has scrolled somewhere on purpose back to today.
  // The guard says the real rule — once per chart — instead of encoding it in
  // which values happen to be listed.
  const anchored = useRef<string | null>(null)
  const { todayX, axisWidth } = laidOut
  useEffect(() => {
    const element = ref.current
    if (element === null || todayX === null || anchored.current === chartId) return
    anchored.current = chartId
    element.scrollLeft = Math.max(
      0,
      todayX * axisWidth - element.clientWidth * TODAY_VIEWPORT_FRACTION,
    )
  }, [chartId, todayX, axisWidth])
  return ref
}

/**
 * Where each visible row starts, in pixels, counting the open info bands above
 * it. The arrow overlay and the rows then agree by arithmetic rather than by
 * measurement — which is what lets the geometry stay a pure function of the
 * chart (ADR-0003).
 */
function rowTopsOf(laidOut: GanttLayout): ReadonlyMap<string, number> {
  const tops = new Map<string, number>()
  let top = 0
  for (const row of laidOut.rows) {
    tops.set(row.node.id, top)
    top += ROW_HEIGHT + (row.infoExpanded ? INFO_BAND_HEIGHT : 0)
  }
  return tops
}

/**
 * A row whose node is not in the chart's node list cannot happen — the layout
 * builds its rows from that list — but the renderer stays total rather than
 * asserting, since a chart is the only copy of itself.
 */
function withoutBody(node: GanttLayout['rows'][number]['node']): GanttNodeView {
  return { ...node, hasBody: false }
}

function FrameMessage({
  tone = 'muted',
  onBack,
  children,
}: {
  tone?: 'muted' | 'destructive'
  onBack: () => void
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border flex h-11 shrink-0 items-center border-b px-4">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the chart list"
          className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring -ml-1.5 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          <ChevronLeft size={13} aria-hidden />
          <span>Charts</span>
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <p
          className={cn(
            'max-w-sm text-center text-sm',
            tone === 'destructive' ? 'text-destructive' : 'text-ink-subtle',
          )}
        >
          {children}
        </p>
      </div>
    </div>
  )
}
