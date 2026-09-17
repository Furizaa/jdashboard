import { assertIssueKey } from './jql'
import { notesDir } from './notes-store'

// The automated changelog for a ticket's note: an append-only list of entries,
// one per Refine run, recording that an AI agent rewrote the note and what it
// changed. Stored beside the note itself as `~/.clashboard/notes/<KEY>.changelog.json`
// — separate from the `.md` so the note stays clean markdown the user can open in
// any editor, and so the changelog is never confused for note content.
//
// Same plain dependency-injected shape as `notes-store` (local disk, no external
// system, injected `fs` for a fake in tests). Upgrade path: a DB-backed store.

export type ChangelogEntry = {
  // ISO-8601 instant the refine ran.
  readonly at: string
  // One or two sentences describing what the agent changed that run.
  readonly summary: string
}

export type ChangelogStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
}

const CHANGELOG_EXT = '.changelog.json'

export function changelogFilePath(homeDir: string, issueKey: string): string {
  const key = assertIssueKey(issueKey, 'changelogFilePath')
  return `${notesDir(homeDir)}/${key}${CHANGELOG_EXT}`
}

// Robust against a missing file (no refine run yet) and any read/parse error —
// each reads as the empty changelog rather than throwing, so the note panel
// always renders. Entries are returned oldest-first, as stored; the view orders
// them for display.
export async function readChangelog(
  issueKey: string,
  deps: ChangelogStoreDeps,
): Promise<ChangelogEntry[]> {
  const path = changelogFilePath(deps.homeDir, issueKey)
  let raw: string
  try {
    raw = await deps.readFile(path)
  } catch {
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is ChangelogEntry =>
        typeof e === 'object' &&
        e !== null &&
        typeof (e as ChangelogEntry).at === 'string' &&
        typeof (e as ChangelogEntry).summary === 'string',
    )
  } catch {
    return []
  }
}

// Append one entry and persist the whole list. Reads the current list first so a
// concurrent refine (rare, single-user) can't silently drop prior entries.
export async function appendChangelog(
  issueKey: string,
  entry: ChangelogEntry,
  deps: ChangelogStoreDeps,
): Promise<ChangelogEntry[]> {
  const existing = await readChangelog(issueKey, deps)
  const next = [...existing, entry]
  await deps.mkdir(notesDir(deps.homeDir))
  await deps.writeFile(changelogFilePath(deps.homeDir, issueKey), JSON.stringify(next, null, 2))
  return next
}
