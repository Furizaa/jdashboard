import { match } from 'ts-pattern'
import type { GanttChart } from '~/kernel'
import { datedExtentOf } from '../domain'
import { toDay, type GanttZoom } from './gantt-axis'

// What the reader has done to the chart: which lanes are collapsed, which info
// bands are open, and which zoom is selected.
//
// A `(state, event) => state` reducer, exhaustive over its event union with
// `ts-pattern` — so a new event is a compile error until every arm handles it,
// which is the point of writing it this way rather than as a bag of setters.
//
// **No persistence here.** Collapse, info-band and zoom are per-viewer
// `localStorage` keyed by chart id (ADR-0012, "Client plumbing") rather than
// fields in `chart.json` an agent could fight with — but reading and writing
// that is slice 92's presenter's job. This file is the state machine; it takes a
// `restored` event and has no opinion about where the value came from.
//
// The chart itself is *not* in here. The chart is server state, owned by the
// coordinator's query cache; holding a copy would be a second source of truth
// for it, and the only thing this file needs from a chart is its extent, once,
// to choose the opening zoom.

export type GanttState = {
  readonly zoom: GanttZoom
  /** Lanes whose descendants are hidden. A collapsed lane is still a row. */
  readonly collapsed: ReadonlySet<string>
  /** Lanes whose markdown body is open inline, under the lane (ADR-0012 §10). */
  readonly expandedInfo: ReadonlySet<string>
}

export type GanttEvent =
  | { readonly type: 'zoomSet'; readonly zoom: GanttZoom }
  | { readonly type: 'collapseToggled'; readonly nodeId: string }
  /**
   * Collapse everything collapsible. The ids ride on the event because the
   * reducer holds no chart — the caller has the rows and therefore already knows
   * which of them have children.
   */
  | { readonly type: 'allCollapsed'; readonly parentIds: readonly string[] }
  | { readonly type: 'allExpanded' }
  | { readonly type: 'infoToggled'; readonly nodeId: string }
  /** A previous session's state, handed back by the presenter from `localStorage`. */
  | { readonly type: 'restored'; readonly state: GanttState }

/**
 * A chart spanning six weeks or less opens at **week** zoom, nine months or less
 * at **month**, anything longer at **quarter**.
 *
 * This is ADR-0012 §10's "the coarsest that fits the chart's extent", read as
 * *the coarsest the extent demands* — equivalently, the finest zoom at which the
 * whole chart is still on one screen. The thresholds are stated in days rather
 * than derived from a tick budget so that the choice is one readable number per
 * level instead of a density heuristic, which §10 rejects for exactly that
 * reason at the continuous-zoom end.
 */
const WEEK_ZOOM_MAX_DAYS = 6 * 7
const MONTH_ZOOM_MAX_DAYS = 9 * 31

function openingZoom(chart: GanttChart): GanttZoom {
  const extent = datedExtentOf(chart.nodes)
  // Nothing dated at all is the state import leaves a chart in. Week zoom, so
  // the first lane that gets a date lands somewhere legible.
  if (extent === null) return 'week'
  const days = toDay(extent.end) - toDay(extent.start) + 1
  if (days <= WEEK_ZOOM_MAX_DAYS) return 'week'
  if (days <= MONTH_ZOOM_MAX_DAYS) return 'month'
  return 'quarter'
}

/**
 * The chart as it first opens: the zoom its extent asks for, **nothing
 * collapsed** and no info band open.
 *
 * Collapsing nothing is deliberate. A chart whose lanes arrive folded hides the
 * decomposition the reader came to see, and the fully collapsed PRD-level view
 * — the useful one — is one click away and worth arriving at on purpose.
 */
export function initialGanttState(chart: GanttChart): GanttState {
  return { zoom: openingZoom(chart), collapsed: new Set(), expandedInfo: new Set() }
}

/** `set` with `member` toggled in or out. */
function toggle(set: ReadonlySet<string>, member: string): ReadonlySet<string> {
  const next = new Set(set)
  if (!next.delete(member)) next.add(member)
  return next
}

export function reduce(state: GanttState, event: GanttEvent): GanttState {
  return (
    match(event)
      .with({ type: 'zoomSet' }, ({ zoom }) => ({ ...state, zoom }))

      .with({ type: 'collapseToggled' }, ({ nodeId }) => ({
        ...state,
        collapsed: toggle(state.collapsed, nodeId),
      }))

      .with({ type: 'allCollapsed' }, ({ parentIds }) => ({
        ...state,
        collapsed: new Set(parentIds),
      }))

      .with({ type: 'allExpanded' }, () => ({ ...state, collapsed: new Set<string>() }))

      // The band stays open on a lane the reader then collapses: collapsing hides
      // the lane's *children*, and the body belongs to the lane itself.
      .with({ type: 'infoToggled' }, ({ nodeId }) => ({
        ...state,
        expandedInfo: toggle(state.expandedInfo, nodeId),
      }))

      .with({ type: 'restored' }, ({ state: restored }) => restored)

      .exhaustive()
  )
}
