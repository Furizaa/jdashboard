import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import { assertIssueKey } from '../lib/jql'
import { listNoteKeys, readNote, writeNote, type NotesStoreDeps } from '../lib/notes-store'

// A ticket's private local note is single-user machine state (one markdown file
// per ticket) with no external system behind it, so — like the tags and
// watchlist mutations — the handlers are a plain try/catch over the disk store
// rather than an Effect program. The read handler always resolves (the store
// reads fault-tolerantly to the empty note), so it needs no wire error envelope;
// the save mutation returns the watchlist-style `{ ok }` result.

export type GetNoteResult = { readonly content: string }

export type ListNotesKeysResult = { readonly keys: readonly string[] }

export type NoteMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } }

function storeDeps(): NotesStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, data) => writeFile(p, data, 'utf8'),
    mkdir: (p) => mkdir(p, { recursive: true }).then(() => {}),
    deleteFile: (p) => unlink(p),
    readDir: (p) => readdir(p),
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export const getNote = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({ key: assertIssueKey(str(data?.key), 'getNote') }))
  .handler(
    async ({ data }): Promise<GetNoteResult> => ({
      content: await readNote(data.key, storeDeps()),
    }),
  )

export const listNotesKeys = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ListNotesKeysResult> => ({ keys: await listNoteKeys(storeDeps()) }),
)

export const saveNote = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; content: string }) => ({
    key: assertIssueKey(str(data?.key), 'saveNote'),
    content: str(data?.content),
  }))
  .handler(
    ({ data }): Promise<NoteMutationResult> =>
      writeNote(data.key, data.content, storeDeps()).then(
        (): NoteMutationResult => ({ ok: true }),
        (e): NoteMutationResult => ({
          ok: false,
          error: { message: e instanceof Error ? e.message : 'unknown error' },
        }),
      ),
  )
