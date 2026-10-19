import type { GanttState, GanttZoom } from '../view-model'

// Collapse, info bands and zoom are **per-viewer** preferences, keyed by chart
// id: `localStorage`, exactly as the main board's collapsed Done column and the
// watchlist's collapsed lanes are, and deliberately **not** fields in
// `chart.json` an agent could fight with (ADR-0012, "Client plumbing").
//
// Every read and every write is wrapped, and both failure modes are real rather
// than theoretical: a private window throws on access, cleared site data reads
// as absent, and a hand-edited value parses to something that is not a chart
// state at all. The surface has to render correctly in all three, so a failed
// read is "no preference yet" and a failed write is dropped — never an error the
// reader has to do something about.

const ZOOMS: ReadonlySet<string> = new Set<GanttZoom>(['week', 'month', 'quarter'])

/** One key per chart, in the shape `clashboard:<surface>:<thing>` establishes. */
function storageKey(chartId: string): string {
  return `clashboard:gantt:${chartId}:view`
}

type StoredState = {
  readonly zoom: string
  readonly collapsed: readonly unknown[]
  readonly expandedInfo: readonly unknown[]
}

function stringsOf(value: unknown): ReadonlySet<string> {
  if (!Array.isArray(value)) return new Set()
  return new Set(value.filter((member): member is string => typeof member === 'string'))
}

/**
 * The state a previous session left for this chart, or `null` when there is
 * none to restore — which is also the answer when storage throws, when the value
 * was written by an older shape, or when someone edited it by hand. The caller
 * then opens the chart the way `initialGanttState` says to.
 */
export function readGanttPreference(chartId: string): GanttState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(chartId))
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<StoredState> | null
    if (parsed === null || typeof parsed !== 'object') return null
    if (typeof parsed.zoom !== 'string' || !ZOOMS.has(parsed.zoom)) return null
    return {
      zoom: parsed.zoom as GanttZoom,
      collapsed: stringsOf(parsed.collapsed),
      expandedInfo: stringsOf(parsed.expandedInfo),
      // Deliberately not restored, and not written below either: a revealed lane
      // is an answer to one hand-off, not a preference. Persisting it would make
      // a refresh re-announce a lane the reader has already been shown, which is
      // exactly what consuming `?node=` with `replace` exists to prevent.
      revealed: null,
      // Nor is a selection, for the neighbouring reason: it is the answer to
      // "what does this lane wait on", asked a moment ago. A chart that reopens
      // with last week's waterfall lit up asserts a focus nobody has.
      selected: null,
    }
  } catch {
    return null
  }
}

/** Persist this chart's view state. A failure is ignored, never surfaced. */
export function writeGanttPreference(chartId: string, state: GanttState): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      storageKey(chartId),
      JSON.stringify({
        zoom: state.zoom,
        collapsed: [...state.collapsed],
        expandedInfo: [...state.expandedInfo],
      }),
    )
  } catch {
    // Ignore persistence failures (private mode, disabled storage, full quota).
  }
}
