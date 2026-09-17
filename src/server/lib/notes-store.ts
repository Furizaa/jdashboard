import { assertIssueKey } from './jql'

// Persistent store for local notes: a single private markdown note per ticket,
// kept as one plain `.md` file per issue under `~/.clashboard/notes/`. Like
// `watchlist-store.ts` and `tags-store.ts` these are plain, dependency-injected
// functions rather than an Effect gateway — it is local-machine file I/O with no
// external system, and the injected `fs` deps make it unit-testable with a fake.
// Upgrade path: swap these deps for a DB-backed store.
//
// One file per ticket (not one aggregate JSON) is deliberate: the note is plain
// markdown the user can open and edit in Obsidian or any editor directly, and the
// filename is the issue key. `assertIssueKey` guards every path so a caller can
// never coax a traversal (`../`) or a stray filename out of the key.

export type NotesStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
  deleteFile: (path: string) => Promise<void>
  readDir: (path: string) => Promise<readonly string[]>
}

const NOTE_EXT = '.md'

export function notesDir(homeDir: string): string {
  return `${homeDir}/.clashboard/notes`
}

export function noteFilePath(homeDir: string, issueKey: string): string {
  const key = assertIssueKey(issueKey, 'noteFilePath')
  return `${notesDir(homeDir)}/${key}.md`
}

// The issue keys that currently have a note file — one shared read that the board
// selects per-card membership from (mirroring the watchlist/workspace queries), so
// a card can show a "has note" badge without a query per card. A missing notes
// directory (nothing written yet) reads as the empty list rather than throwing.
export async function listNoteKeys(deps: NotesStoreDeps): Promise<string[]> {
  let entries: readonly string[]
  try {
    entries = await deps.readDir(notesDir(deps.homeDir))
  } catch {
    return []
  }
  return entries
    .filter((name) => name.endsWith(NOTE_EXT))
    .map((name) => name.slice(0, -NOTE_EXT.length))
    .filter((key) => key.length > 0)
}

// Robust against a missing file (no note written yet) and any read error — either
// case reads as the empty note rather than throwing, so the editor always opens.
export async function readNote(issueKey: string, deps: NotesStoreDeps): Promise<string> {
  const path = noteFilePath(deps.homeDir, issueKey)
  try {
    return await deps.readFile(path)
  } catch {
    return ''
  }
}

// A blank note (empty or whitespace-only) deletes the file rather than persisting
// an empty one, so `~/.clashboard/notes/` never accumulates empty markdown files.
// A missing-file delete is swallowed (nothing to remove is success).
export async function writeNote(
  issueKey: string,
  content: string,
  deps: NotesStoreDeps,
): Promise<void> {
  const path = noteFilePath(deps.homeDir, issueKey)
  if (content.trim() === '') {
    try {
      await deps.deleteFile(path)
    } catch {
      // no file to delete — already the empty note
    }
    return
  }
  await deps.mkdir(notesDir(deps.homeDir))
  await deps.writeFile(path, content)
}
