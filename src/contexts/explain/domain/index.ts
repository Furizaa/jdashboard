// Only what the view-model and the views consume. The rules' own tests import
// their module directly, so the barrel stays the production surface.
export { groupFindingsBySystem, layOutReport, type FindingGroup } from './block-altitude'
export {
  findingCountOf,
  moveById,
  moveDiffFor,
  verdictIn,
  worstSeverityIn,
  worstSeverityOf,
  type MoveDiff,
} from './moves'
export { mermaidForModel, type ModelEntityStyles } from './model-diagram'
export { freshnessWarning, shortSha } from './stale-commits'
export {
  FIT_VIEWPORT,
  panBy,
  wheelZoomFactor,
  zoomAbout,
  ZOOM_STEP,
  zoomLabel,
  type DiagramViewport,
} from './diagram-viewport'
