import { useMemo } from 'react'
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
import { GanttChartRow, BAR_REGION_CLASS, ROW_HEIGHT, TREE_COLUMN_CLASS } from './GanttRow'
import { INFO_BAND_HEIGHT } from './InfoBand'

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
// **Nothing here mutates the chart.** Expand, collapse, zoom and read; the agent
// is the only writer (ADR-0012 §8), so there is no control on this surface that
// a reader could mistake for one.

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChartHeader api={api} onBack={onBack} />
      <CycleWarning cycles={laidOut.cycles} titleOf={api.titleOf} />
      {/* The axis strip sits outside the scroll area so it stays put while the
          lanes scroll, and its left spacer is exactly the tree column's width. */}
      <div className="border-border bg-background flex shrink-0 border-b">
        <div className={cn('border-border/60 shrink-0 border-r', TREE_COLUMN_CLASS)} />
        <GanttAxis ticks={laidOut.ticks} todayX={laidOut.todayX} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* `min-h-full` so the gridlines and the today line carry on past the
            last lane rather than stopping in mid-air on a short chart. */}
        <div className="relative min-h-full">
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
                onToggleCollapse={() => api.toggleCollapse(row.node.id)}
                onToggleInfo={() => api.toggleInfo(row.node.id)}
                onOpenIssue={onOpenIssue}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
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
