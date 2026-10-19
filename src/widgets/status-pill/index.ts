export { StatusPill } from './view/StatusPill'
export { StatusPillSelect } from './view/StatusPillSelect'
// The palette's status sub-list labels transitions the same way the pill's own
// dropdown does; one display rule, two surfaces.
export { displayNameForStatus } from './domain/status-display-name'
// The Gantt tones a bar by the ticket's real status, and a bar whose colour
// disagreed with the chip on the same ticket's card would be two answers to one
// question — so the palette is the pill's, read rather than re-picked.
export { styleForStatus } from './domain/status-color'
