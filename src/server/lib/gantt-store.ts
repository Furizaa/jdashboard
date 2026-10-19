import { assertChartId, assertNodeId, ganttChartSchema, type GanttChart } from './gantt-schema'

// Where a Gantt chart lives: one folder per chart under `~/.clashboard/gantt/`,
// with the skeleton in `chart.json` and each node's markdown body as its own
// file beside it.
//
//     ~/.clashboard/gantt/<chartId>/
//       chart.json               the tree, edges, jiraSources, lastSyncedAt
//       chart.changelog.json     append-only audit (gantt-changelog-store.ts)
//       bodies/<nodeId>.md       one PRD or issue each
//       bodies/<nodeId>.md.prev  one level of undo
//     ~/.clashboard/gantt/.archive/<chartId>/   archived, never erased
//
// Plain dependency-injected functions rather than an Effect gateway, for the
// reason `notes-store.ts` states: local-machine file I/O with no external
// system, and the injected `fs` deps make it unit-testable with a fake. Upgrade
// path: swap these deps for a DB-backed store. Nothing here imports `node:fs` —
// every path this module touches arrives through `deps`.
//
// A body is a **separate file** rather than a field in `chart.json`, for two
// reasons ADR-0012 §11 gives. It is markdown someone may want to open in an
// editor, as a note already is; and it keeps the API cheap for its consumer —
// `GET /charts/:id` returns the skeleton, bodies are fetched per node, so an
// agent looking up a node id pays nothing for PRD prose and a `PATCH` to one
// node does not rewrite every PRD in the chart.
//
// This is also the one store in the app that is a **system of record** rather
// than a cache of someone else's record (ADR-0012 §1), and that shows up here as
// two rules the other stores do not have: a body write snapshots its
// predecessor, and nothing in this module deletes anything.
//
// `assertChartId` / `assertNodeId` guard every path, so a chart id can never
// become a traversal and a node id can never become a stray filename.

export type GanttStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  readDir: (path: string) => Promise<readonly string[]>
  /** Moves a directory. Only `archiveChart` needs it, and only ever within `gantt/`. */
  rename: (from: string, to: string) => Promise<void>
  /**
   * An ISO-8601 instant. Injected rather than read from `Date` because the one
   * thing in this module that needs the clock — the archive collision suffix —
   * is otherwise untestable.
   */
  now: () => string
}

const CHART_FILE = 'chart.json'
const BODIES_DIR = 'bodies'
const BODY_EXT = '.md'
const PREV_EXT = '.prev'
const ARCHIVE_DIR = '.archive'

export function ganttDir(homeDir: string): string {
  return `${homeDir}/.clashboard/gantt`
}

export function chartDir(homeDir: string, chartId: string): string {
  return `${ganttDir(homeDir)}/${assertChartId(chartId, 'chartDir')}`
}

export function chartFilePath(homeDir: string, chartId: string): string {
  return `${chartDir(homeDir, chartId)}/${CHART_FILE}`
}

function bodiesDir(homeDir: string, chartId: string): string {
  return `${chartDir(homeDir, chartId)}/${BODIES_DIR}`
}

export function bodyFilePath(homeDir: string, chartId: string, nodeId: string): string {
  const node = assertNodeId(nodeId, 'bodyFilePath')
  return `${bodiesDir(homeDir, chartId)}/${node}${BODY_EXT}`
}

/** The one level of undo ADR-0012 §11 buys, sitting beside the body it replaced. */
export function bodyPrevFilePath(homeDir: string, chartId: string, nodeId: string): string {
  return `${bodyFilePath(homeDir, chartId, nodeId)}${PREV_EXT}`
}

export function archiveDir(homeDir: string): string {
  return `${ganttDir(homeDir)}/${ARCHIVE_DIR}`
}

/**
 * What the chart list needs and nothing more: the header fields plus the two
 * counts that make a row worth looking at. The nodes themselves are not here —
 * a list of twenty charts would otherwise carry every node in all of them.
 */
export type GanttChartSummary = {
  readonly id: string
  readonly title: string
  readonly jiraSources: readonly string[]
  readonly lastSyncedAt: string | null
  readonly nodeCount: number
  readonly doneCount: number
}

function summarize(chart: GanttChart): GanttChartSummary {
  return {
    id: chart.id,
    title: chart.title,
    jiraSources: chart.jiraSources,
    lastSyncedAt: chart.lastSyncedAt,
    nodeCount: chart.nodes.length,
    doneCount: chart.nodes.filter((node) => node.column === 'Done').length,
  }
}

/**
 * A missing file reads as absent, not as an error — "no chart by that id" is an
 * ordinary 404, not a defect. A file that is present but unparseable or invalid
 * **also** reads as absent: validating on the way in matters more here than
 * anywhere else in the app, because the renderers match this shape exhaustively
 * and a hand-edited `chart.json` must not reach them.
 */
export async function readChart(chartId: string, deps: GanttStoreDeps): Promise<GanttChart | null> {
  // The guard runs outside the `try`: an unguarded id is a programming error and
  // must not be swallowed as "no such chart".
  const path = chartFilePath(deps.homeDir, chartId)
  let raw: string
  try {
    raw = await deps.readFile(path)
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const result = ganttChartSchema.safeParse(parsed)
  // The id in the body is not the chart's identity — the folder name is — so a
  // mismatched `id` inside cannot make one chart answer for another.
  if (!result.success || result.data.id !== chartId) return null
  return result.data
}

export async function writeChart(chart: GanttChart, deps: GanttStoreDeps): Promise<void> {
  const path = chartFilePath(deps.homeDir, chart.id)
  await deps.mkdir(chartDir(deps.homeDir, chart.id))
  await deps.writeFile(path, `${JSON.stringify(chart, null, 2)}\n`)
}

/**
 * Every chart on disk, by id, with one corrupt chart unable to break the list.
 * A chart whose `chart.json` is missing or unparseable is **skipped** rather
 * than thrown over: the list is how a user finds the chart that still works.
 *
 * `.archive` is excluded for free — it is not a slug, so it never survives the
 * id filter. That is the same rule the path guard enforces, not a second one
 * that can drift from it.
 */
export async function listCharts(deps: GanttStoreDeps): Promise<GanttChartSummary[]> {
  let entries: readonly string[]
  try {
    entries = await deps.readDir(ganttDir(deps.homeDir))
  } catch {
    return []
  }
  const ids = entries.filter(isChartId).toSorted((a, b) => a.localeCompare(b))
  const summaries: GanttChartSummary[] = []
  for (const id of ids) {
    // Sequential on purpose: this is a handful of small local files, and a
    // bounded pool would be more machinery than the read is worth.
    // oxlint-disable-next-line no-await-in-loop -- see comment above
    const chart = await readChart(id, deps)
    if (chart !== null) summaries.push(summarize(chart))
  }
  return summaries
}

function isChartId(name: string): boolean {
  try {
    assertChartId(name, 'listCharts')
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

/** A node with no body reads as `null`, which is the common case for a jira node. */
export async function readBody(
  chartId: string,
  nodeId: string,
  deps: GanttStoreDeps,
): Promise<string | null> {
  const path = bodyFilePath(deps.homeDir, chartId, nodeId)
  try {
    return await deps.readFile(path)
  } catch {
    return null
  }
}

/**
 * Write a node's body, keeping its predecessor as `<nodeId>.md.prev`.
 *
 * The snapshot is **not optional**. It is the one level of undo ADR-0012 §11
 * buys over the only content in the app that is genuinely irreplaceable: a PRD
 * the chart is the only copy of. "The agent rewrote my PRD" is recoverable
 * because of this line; "it did that three times" is the stated ceiling, and
 * git over `~/.clashboard/gantt/` is the named upgrade path.
 *
 * There was no previous body → no `.prev` is written, rather than an empty one.
 * A `.prev` that exists means there is something to go back to.
 */
export async function writeBody(
  chartId: string,
  nodeId: string,
  markdown: string,
  deps: GanttStoreDeps,
): Promise<void> {
  const path = bodyFilePath(deps.homeDir, chartId, nodeId)
  const previous = await readBody(chartId, nodeId, deps)
  await deps.mkdir(bodiesDir(deps.homeDir, chartId))
  if (previous !== null) {
    await deps.writeFile(bodyPrevFilePath(deps.homeDir, chartId, nodeId), previous)
  }
  await deps.writeFile(path, markdown)
}

/**
 * The node ids that currently have a body — one shared read that the chart's
 * skeleton derives every `hasBody` from, mirroring `listNoteKeys`'s shape, so a
 * forty-node chart costs one directory read rather than forty stats. A missing
 * `bodies/` directory (nothing written yet) reads as the empty list.
 *
 * `.md.prev` files are not bodies and do not appear here.
 */
export async function bodyNodeIds(chartId: string, deps: GanttStoreDeps): Promise<string[]> {
  const dir = bodiesDir(deps.homeDir, chartId)
  let entries: readonly string[]
  try {
    entries = await deps.readDir(dir)
  } catch {
    return []
  }
  return entries
    .filter((name) => name.endsWith(BODY_EXT))
    .map((name) => name.slice(0, -BODY_EXT.length))
    .filter((id) => id.length > 0)
}

export async function hasBody(
  chartId: string,
  nodeId: string,
  deps: GanttStoreDeps,
): Promise<boolean> {
  const node = assertNodeId(nodeId, 'hasBody')
  return (await bodyNodeIds(chartId, deps)).includes(node)
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------

/** `2026-10-19T09:00:00.000Z` → `20261019t090000000z`, which is a slug. */
function archiveSuffix(instant: string): string {
  const slugged = instant.toLowerCase().replaceAll(/[^a-z0-9]/gu, '')
  return slugged === '' ? 'archived' : slugged
}

/**
 * Move a chart's folder under `gantt/.archive/`. This is the **only** way a
 * chart leaves the list, and it is a confirmed UI action rather than an API
 * verb: single-writer is a rule about chart *content*, and the irreversible verb
 * over a system of record belongs with the human rather than with a process
 * acting on paraphrased instructions (ADR-0012 §8). There is no
 * `DELETE /charts/:chartId`, and there is nothing in this module that erases.
 *
 * An archive entry of the same id already there is **not** overwritten — it
 * would be the second half of the same mistake. The move takes a timestamped
 * name instead, and returns where it landed.
 */
export async function archiveChart(chartId: string, deps: GanttStoreDeps): Promise<string> {
  const from = chartDir(deps.homeDir, chartId)
  const archive = archiveDir(deps.homeDir)
  let existing: readonly string[]
  try {
    existing = await deps.readDir(archive)
  } catch {
    existing = []
  }
  const id = assertChartId(chartId, 'archiveChart')
  const name = existing.includes(id) ? `${id}-${archiveSuffix(deps.now())}` : id
  const to = `${archive}/${name}`
  await deps.mkdir(archive)
  await deps.rename(from, to)
  return to
}
