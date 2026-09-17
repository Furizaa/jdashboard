// Persistent store for the Watchlist Board's lane configuration: an ordered list
// of lanes, each bound to one or more tags. A card is placed in a lane when it
// carries *any* of that lane's tags (union). Kept as plain, dependency-injected
// functions (mirroring `tags-store.ts` / `watchlist-store.ts`) rather than an
// Effect gateway — it is local-machine file I/O with no external system, and the
// injected `fs` deps make it unit-testable with a fake.
//
// The store treats each tag id as an opaque non-empty token; it does not know the
// tag palette (that lives client-side, kernel). Lanes whose tags were since
// deleted are pruned *by the client* against the live tag definitions.

export type WatchlistLaneConfig = {
  /** Stable lane id (client-generated). Independent of the tags, so a lane keeps
   * its collapsed state as its tag set is edited. */
  readonly id: string
  /** The tags whose cards this lane collects (union). */
  readonly tagIds: readonly string[]
}

export type WatchlistLanesState = {
  readonly lanes: readonly WatchlistLaneConfig[]
}

export type WatchlistLanesStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
}

const EMPTY_STATE: WatchlistLanesState = { lanes: [] }

export function watchlistLanesDir(homeDir: string): string {
  return `${homeDir}/.clashboard`
}

export function watchlistLanesFilePath(homeDir: string): string {
  return `${watchlistLanesDir(homeDir)}/watchlist-lanes.json`
}

function cleanTagIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id.length > 0))]
}

// A lane needs a non-empty id and at least one tag; a tagless lane matches nothing
// and would render as dead space, so it is dropped rather than persisted.
function normalizeLane(raw: unknown): WatchlistLaneConfig | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { id, tagIds } = raw as { id?: unknown; tagIds?: unknown }
  if (typeof id !== 'string' || id.length === 0) return null
  const cleaned = cleanTagIds(tagIds)
  if (cleaned.length === 0) return null
  return { id, tagIds: cleaned }
}

function normalizeLanes(raw: readonly unknown[]): WatchlistLaneConfig[] {
  const lanes: WatchlistLaneConfig[] = []
  const seen = new Set<string>()
  for (const entry of raw) {
    const lane = normalizeLane(entry)
    if (lane === null || seen.has(lane.id)) continue
    seen.add(lane.id)
    lanes.push(lane)
  }
  return lanes
}

// Robust against a missing file (never written yet) and against hand-edits that
// leave malformed JSON — either case reads as the empty configuration rather than
// throwing. Also migrates the earlier single-tag-per-lane shape
// (`{ laneTagIds: string[] }`) so a config saved before multi-tag lanes still
// loads (each old tag becomes a one-tag lane, keyed by the tag id).
export async function readWatchlistLanes(
  deps: WatchlistLanesStoreDeps,
): Promise<WatchlistLanesState> {
  let raw: string
  try {
    raw = await deps.readFile(watchlistLanesFilePath(deps.homeDir))
  } catch {
    return EMPTY_STATE
  }
  try {
    const parsed = JSON.parse(raw) as { lanes?: unknown; laneTagIds?: unknown }
    if (Array.isArray(parsed?.lanes)) {
      return { lanes: normalizeLanes(parsed.lanes) }
    }
    if (Array.isArray(parsed?.laneTagIds)) {
      const migrated = parsed.laneTagIds
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .map((id) => ({ id, tagIds: [id] }))
      return { lanes: normalizeLanes(migrated) }
    }
    return EMPTY_STATE
  } catch {
    return EMPTY_STATE
  }
}

// Replaces the whole ordered lane list. The client sends the full desired
// configuration on every change (the config modal owns the source of truth), so
// there is no per-lane add/remove/move to model here — one atomic write.
// Malformed and tagless lanes are dropped so a hand-crafted payload can never
// corrupt the file.
export async function setWatchlistLanes(
  lanes: readonly unknown[],
  deps: WatchlistLanesStoreDeps,
): Promise<WatchlistLanesState> {
  const next: WatchlistLanesState = { lanes: normalizeLanes(lanes) }
  await deps.mkdir(watchlistLanesDir(deps.homeDir))
  await deps.writeFile(watchlistLanesFilePath(deps.homeDir), `${JSON.stringify(next, null, 2)}\n`)
  return next
}
