import { assertChartId } from './gantt-schema'
import { chartDir } from './gantt-store'

// The audit trail for one chart: an append-only list of entries, one per API
// write, recording who changed the plan and what they changed. Stored beside
// `chart.json` as `~/.clashboard/gantt/<chartId>/chart.changelog.json` — separate
// from the chart so the chart stays the shape the schema validates, and so an
// entry is never confused for chart content.
//
// This is the third of the three things ADR-0012 §1's exception is paid for
// with: validation at the boundary (§9), serialised writes (§8), and this.
// Calling an application the system of record for something and keeping no
// record of what was done to it does not square, and "what has the agent been
// doing to my plan" is itself part of the visibility the feature exists for — so
// the UI renders this rather than it being a debugging aid.
//
// Same plain dependency-injected shape as `notes-changelog-store` (local disk,
// no external system, injected `fs` for a fake in tests). Upgrade path: a
// DB-backed store, or `git init` over `~/.clashboard/gantt/` if more than one
// level of body undo is ever wanted.

/**
 * Who made the change. Three arms because they are three different stories in
 * the UI: `agent` is an API write, `sync` is Jira reconciliation, and `user` is
 * one of the two lifecycle verbs the human owns.
 */
export type GanttChangelogActor = 'agent' | 'sync' | 'user'

const ACTORS: ReadonlySet<string> = new Set<GanttChangelogActor>(['agent', 'sync', 'user'])

export type GanttChangelogEntry = {
  // ISO-8601 instant the write happened.
  readonly at: string
  readonly actor: GanttChangelogActor
  // One or two sentences describing what changed.
  readonly summary: string
}

export type GanttChangelogStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
}

const CHANGELOG_FILE = 'chart.changelog.json'

export function chartChangelogFilePath(homeDir: string, chartId: string): string {
  return `${chartDir(homeDir, assertChartId(chartId, 'chartChangelogFilePath'))}/${CHANGELOG_FILE}`
}

function isEntry(value: unknown): value is GanttChangelogEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as GanttChangelogEntry
  return (
    typeof entry.at === 'string' && typeof entry.summary === 'string' && ACTORS.has(entry.actor)
  )
}

/**
 * Robust against a missing file (no write yet) and any read/parse error — each
 * reads as the empty changelog rather than throwing, so the chart always
 * renders. Entries are returned oldest-first, as stored; the view orders them
 * for display.
 */
export async function readChartChangelog(
  chartId: string,
  deps: GanttChangelogStoreDeps,
): Promise<GanttChangelogEntry[]> {
  const path = chartChangelogFilePath(deps.homeDir, chartId)
  let raw: string
  try {
    raw = await deps.readFile(path)
  } catch {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry)
  } catch {
    return []
  }
}

/**
 * Append one entry and persist the whole list. Reads the current list first so a
 * concurrent write cannot silently drop prior entries — and in the API's case
 * the whole read-modify-write happens inside the per-chart write queue's
 * critical section (slice 93), alongside the chart write it describes.
 */
export async function appendChartChangelog(
  chartId: string,
  entry: GanttChangelogEntry,
  deps: GanttChangelogStoreDeps,
): Promise<GanttChangelogEntry[]> {
  const existing = await readChartChangelog(chartId, deps)
  const next = [...existing, entry]
  await deps.mkdir(chartDir(deps.homeDir, chartId))
  await deps.writeFile(chartChangelogFilePath(deps.homeDir, chartId), JSON.stringify(next, null, 2))
  return next
}
