import { assertIssueKey } from './jql'

// Persistent store for the watchlist: a small JSON file of Jira issue keys the
// user advises on but is not assigned to. Kept as plain, dependency-injected
// functions (mirroring `open-workspace.ts`) rather than an Effect gateway —
// it is local-machine file I/O, and the injected `fs` deps make it unit-testable
// with a fake. Upgrade path: swap these deps for a DB-backed store.

export type WatchlistStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
}

export function watchlistDir(homeDir: string): string {
  return `${homeDir}/.clashboard`
}

export function watchlistFilePath(homeDir: string): string {
  return `${watchlistDir(homeDir)}/watchlist.json`
}

// Robust against a missing file (never written yet) and against hand-edits that
// leave malformed JSON — either case reads as an empty list rather than throwing.
export async function readWatchlistKeys(deps: WatchlistStoreDeps): Promise<string[]> {
  let raw: string
  try {
    raw = await deps.readFile(watchlistFilePath(deps.homeDir))
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    const keys = (parsed as { keys?: unknown })?.keys
    if (!Array.isArray(keys)) return []
    return [...new Set(keys.filter((k): k is string => typeof k === 'string'))]
  } catch {
    return []
  }
}

async function writeKeys(keys: readonly string[], deps: WatchlistStoreDeps): Promise<void> {
  await deps.mkdir(watchlistDir(deps.homeDir))
  await deps.writeFile(watchlistFilePath(deps.homeDir), `${JSON.stringify({ keys }, null, 2)}\n`)
}

export async function addWatchlistKey(key: string, deps: WatchlistStoreDeps): Promise<string[]> {
  const validated = assertIssueKey(key, 'addWatchlistKey')
  const current = await readWatchlistKeys(deps)
  if (current.includes(validated)) return current
  const next = [...current, validated]
  await writeKeys(next, deps)
  return next
}

export async function removeWatchlistKey(key: string, deps: WatchlistStoreDeps): Promise<string[]> {
  const current = await readWatchlistKeys(deps)
  const next = current.filter((k) => k !== key)
  if (next.length === current.length) return current
  await writeKeys(next, deps)
  return next
}
