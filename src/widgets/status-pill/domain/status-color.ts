export type StatusShape =
  | 'todo'
  | 'blocked'
  | 'progress-25'
  | 'progress-50'
  | 'progress-75'
  | 'done'
  | 'review-needs'
  | 'review-rejected'
  | 'review-accepted'

export type StatusStyle = {
  shape: StatusShape
  color: string
  label: string
}

// One colour per status, used by the pill, by the card's chip, and — since the
// Gantt started toning a bar by its real status — by the bars on a chart.
//
// **`In STG` onwards is one hue.** Those four statuses are the ones `Column`
// folds into `Done`, and they used to be cyan, violet, pink and green: four
// unrelated hues for four steps of one release pipeline, which on a Gantt bar
// (a large filled shape rather than a 12px chip) read as a rainbow rather than
// as progress. They are now a **single green, lightening as the work advances**
// — green-700 → green-600 → green-500 → green-400 — so the ramp orders itself
// and the eye reads "nearly shipped" without decoding a legend. `Done` is the
// brightest because it is the end of the ramp, not because it is a different
// thing from the three before it.
//
// The ramp starts at 700 rather than 800 deliberately. A bar is filled at 60%
// alpha over a near-black background, which compresses the dark end of any hue:
// 800 and 700 came out indistinguishable on a chart, and three steps nobody can
// tell apart is a worse answer than three they can. Telling them apart is a
// secondary job anyway — every lane carries its status in text beside the bar,
// so the ramp only has to say "further along", not "exactly which".
//
// Everything before STG stays its own hue, because those *are* different kinds
// of state rather than steps of one: `Reviewed` is waiting, `In Implementation`
// is being built, `In Code Review` is being read, and `Blocked` is stuck. The
// three `review *` entries are GitLab reviewer states, a separate vocabulary,
// and are not part of this ramp.
const STATUS_STYLES: Record<string, StatusStyle> = {
  reviewed: { shape: 'todo', color: '#eab308', label: '#fbbf24' },
  blocked: { shape: 'blocked', color: '#ef4444', label: '#f87171' },
  'in implementation': { shape: 'progress-25', color: '#3b82f6', label: '#60a5fa' },
  'in code review': { shape: 'progress-50', color: '#f97316', label: '#fb923c' },
  'in stg': { shape: 'progress-75', color: '#15803d', label: '#4ade80' },
  'in qa': { shape: 'progress-75', color: '#16a34a', label: '#4ade80' },
  'in uat': { shape: 'progress-75', color: '#22c55e', label: '#86efac' },
  done: { shape: 'done', color: '#4ade80', label: '#86efac' },
  'needs review': { shape: 'review-needs', color: '#22d3ee', label: '#67e8f9' },
  'review rejected': { shape: 'review-rejected', color: '#ef4444', label: '#f87171' },
  'review accepted': { shape: 'review-accepted', color: '#10b981', label: '#34d399' },
}

const FALLBACK: StatusStyle = { shape: 'todo', color: '#94a3b8', label: '#cbd5e1' }

export function styleForStatus(status: string): StatusStyle {
  return STATUS_STYLES[status.toLowerCase()] ?? FALLBACK
}
