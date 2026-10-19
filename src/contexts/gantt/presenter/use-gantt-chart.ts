import { useCallback, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { useGanttBody, useGanttChart as useGanttChartQuery } from '~/coordinator'
import type { GanttChart, GanttChartView } from '~/kernel'
import {
  initialGanttState,
  layout,
  reduce,
  type GanttEvent,
  type GanttLayout,
  type GanttState,
  type GanttZoom,
} from '../view-model'
import { readGanttPreference, writeGanttPreference } from './gantt-preference'

// The Gantt's composition root: the server's chart, the reader's view state, and
// the pure layout function, folded into the one thing the views render. The only
// React in this context lives here and in `view/` (ADR-0003).
//
// Three things are deliberately *not* here. The geometry is
// `view-model/gantt-layout.ts` — this hook calls it and renders nothing itself.
// The state transitions are `view-model/gantt-state.ts` — this hook only decides
// where a restored state comes from. And there is no mutation of any kind: the
// agent is the chart's only writer (ADR-0012 §8), so the API this returns has
// expand, collapse, zoom and read, and nothing that could change a plan.

/**
 * Row windowing is designed for and not implemented (ADR-0012 §10). The layout
 * function takes a visible range from inception, so the day a three-hundred-node
 * chart arrives the change is this constant becoming a scroll position — and not
 * a change to the function.
 */
const ALL_ROWS = { first: 0, count: Number.MAX_SAFE_INTEGER } as const

export type GanttChartApi =
  | { readonly phase: 'loading' }
  /** The URL names a chart that is not on disk — a stale bookmark, not an error. */
  | { readonly phase: 'missing'; readonly chartId: string }
  | { readonly phase: 'error'; readonly message: string }
  | {
      readonly phase: 'ready'
      readonly chartId: string
      readonly chart: GanttChartView
      readonly layout: GanttLayout
      readonly zoom: GanttZoom
      /** Whether every lane with children is already folded. */
      readonly allCollapsed: boolean
      readonly setZoom: (zoom: GanttZoom) => void
      readonly toggleCollapse: (nodeId: string) => void
      readonly collapseAll: () => void
      readonly expandAll: () => void
      readonly toggleInfo: (nodeId: string) => void
      /** A lane's title by id, for the cycle warning and the arrow labels. */
      readonly titleOf: (nodeId: string) => string
    }

/** What the reader has done to *this* chart. Reset when the chart id changes. */
type GanttSession = { readonly chartId: string; readonly state: GanttState }

/**
 * The chart as the layout function wants it.
 *
 * `GanttChartView` carries `hasBody` per node and holds its nodes `readonly`,
 * while the Zod-inferred `GanttChart` holds them mutable — the friction slice 91
 * recorded and ADR-0012 leaves alone deliberately, because `.readonly()` would
 * ripple through every builder in the write surface for a guarantee nothing
 * needs. One copy here is the whole cost of living with it, and it is memoised
 * because the layout memo keys off this value.
 */
function toLayoutChart(view: GanttChartView): GanttChart {
  return { ...view, nodes: [...view.nodes] }
}

export function useGanttChart(chartId: string): GanttChartApi {
  const query = useGanttChartQuery(chartId)
  const result = query.data

  const view = result?.ok === true ? result.chart : null
  const chart = useMemo(() => (view === null ? null : toLayoutChart(view)), [view])

  // Set during render when the chart arrives or the reader opens a different
  // one, which is React's own answer to "state derived from a prop": the
  // alternative is an effect that renders the wrong chart's collapse set once
  // before correcting it.
  const [session, setSession] = useState<GanttSession | null>(null)
  if (chart !== null && session?.chartId !== chartId) {
    setSession({ chartId, state: readGanttPreference(chartId) ?? initialGanttState(chart) })
  }
  const state = session?.chartId === chartId ? session.state : null

  // Persisting inside the updater is the shape `useCollapsedDone` establishes:
  // the write is the same bytes however many times it runs, and the alternative
  // is an effect that fires on every unrelated re-render.
  const dispatch = useCallback((event: GanttEvent) => {
    setSession((previous) => {
      if (previous === null) return previous
      const next = reduce(previous.state, event)
      writeGanttPreference(previous.chartId, next)
      return { chartId: previous.chartId, state: next }
    })
  }, [])

  // Injected rather than read inside the layout, which is pure. The local
  // calendar day, not the UTC one: a chart date is the day a person means.
  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])

  const laidOut = useMemo(
    () =>
      chart === null || state === null
        ? null
        : layout(chart, {
            zoom: state.zoom,
            collapsed: state.collapsed,
            expandedInfo: state.expandedInfo,
            visibleRange: ALL_ROWS,
            today,
          }),
    [chart, state, today],
  )

  const titleOf = useCallback(
    (nodeId: string) => view?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId,
    [view],
  )

  const actions = useGanttActions(dispatch, laidOut)

  if (query.isError) {
    return { phase: 'error', message: errorMessage(query.error) }
  }
  // `runWire` demotes its internal-error arm to a thrown `Error`, which the
  // `isError` branch above catches — so the one failure left in the envelope is
  // the chart not being on disk.
  if (result?.ok === false) {
    return { phase: 'missing', chartId }
  }
  if (view === null || state === null || laidOut === null) {
    return { phase: 'loading' }
  }
  return {
    phase: 'ready',
    chartId,
    chart: view,
    layout: laidOut,
    zoom: state.zoom,
    allCollapsed: everyParentCollapsed(laidOut),
    titleOf,
    ...actions,
  }
}

type GanttActions = Pick<
  Extract<GanttChartApi, { phase: 'ready' }>,
  'setZoom' | 'toggleCollapse' | 'collapseAll' | 'expandAll' | 'toggleInfo'
>

/**
 * The five things the reader can do. `collapseAll` carries the parent ids on the
 * event because the reducer holds no chart — the rows are here and already know
 * which lanes have children.
 */
function useGanttActions(
  dispatch: (event: GanttEvent) => void,
  laidOut: GanttLayout | null,
): GanttActions {
  const parentIds = useMemo(
    () =>
      laidOut === null
        ? []
        : laidOut.rows.filter((row) => row.hasChildren).map((row) => row.node.id),
    [laidOut],
  )
  return useMemo(
    () => ({
      setZoom: (zoom: GanttZoom) => dispatch({ type: 'zoomSet', zoom }),
      toggleCollapse: (nodeId: string) => dispatch({ type: 'collapseToggled', nodeId }),
      // The visible parents are the collapsible ones, and a collapsed lane hides
      // the parents beneath it — so this folds one level per press from the
      // outside in, arriving at the PRD-level view ADR-0012 §10 calls the most
      // useful of all.
      collapseAll: () => dispatch({ type: 'allCollapsed', parentIds }),
      expandAll: () => dispatch({ type: 'allExpanded' }),
      toggleInfo: (nodeId: string) => dispatch({ type: 'infoToggled', nodeId }),
    }),
    [dispatch, parentIds],
  )
}

/** Every visible lane with children is folded, so there is nothing left to fold. */
function everyParentCollapsed(laidOut: GanttLayout): boolean {
  const parents = laidOut.rows.filter((row) => row.hasChildren)
  return parents.length > 0 && parents.every((row) => row.collapsed)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'This chart could not be read.'
}

export type GanttNodeBody =
  | { readonly phase: 'loading' }
  | { readonly phase: 'empty' }
  | { readonly phase: 'error' }
  | { readonly phase: 'ready'; readonly markdown: string }

/**
 * One lane's markdown body, read **only** while its band is open — which is what
 * `open` does here. A chart of forty lanes costs one skeleton read to draw; a
 * body is a second read per band the reader actually opens (ADR-0012 §11).
 */
export function useGanttNodeBody(chartId: string, nodeId: string, open: boolean): GanttNodeBody {
  const query = useGanttBody(open ? chartId : null, open ? nodeId : null)
  if (query.isError) return { phase: 'error' }
  if (query.data === undefined) return { phase: 'loading' }
  if (!query.data.ok) return { phase: 'error' }
  const markdown = query.data.body.markdown
  return markdown === null || markdown.trim() === ''
    ? { phase: 'empty' }
    : { phase: 'ready', markdown }
}
