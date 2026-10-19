// Only what the view-model and the views consume. The rules' own tests import
// their module directly, so the barrel stays the production surface.
export {
  buildTree,
  visibleRows,
  type GanttTree,
  type GanttTreeNode,
  type GanttVisibleRow,
} from './tree'
export { blockedStateFor, type GanttBlockedState } from './blocked'
export { findCycles, type GanttCycle, type GanttCycles } from './cycles'
export { progressFor, NO_PROGRESS, type ColumnDistribution, type GanttProgress } from './progress'
export { isSyncStale, SYNC_STALE_AFTER_MS, type SyncStaleness } from './staleness'
export {
  axisExtentOf,
  childSpanFor,
  datedExtentOf,
  datedSpanOf,
  openSpanOf,
  type GanttChildSpan,
  type GanttOpenSpan,
  type GanttSpan,
} from './child-span'
