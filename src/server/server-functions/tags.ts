import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import { assertIssueKey } from '../lib/jql'
import {
  attachTag,
  createTagDefinition,
  deleteTagDefinition,
  detachTag,
  readTagsState,
  updateTagDefinition,
  type TagDefinition,
  type TagsState,
  type TagsStoreDeps,
} from '../lib/tags-store'

// Local tags are single-user machine state with no external system behind them,
// so — like the watchlist mutations — every handler is a plain try/catch over the
// disk store rather than an Effect program. The read handler always resolves (the
// store reads fault-tolerantly to the empty state), so it needs no wire error
// envelope; mutations return the watchlist-style `{ ok }` result.

export type { TagDefinition, TagsState }

export type GetTagsStateResult = TagsState

export type TagMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } }

function storeDeps(): TagsStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, data) => writeFile(p, data, 'utf8'),
    mkdir: (p) => mkdir(p, { recursive: true }).then(() => {}),
  }
}

function toMutationResult(run: () => Promise<unknown>): Promise<TagMutationResult> {
  return run().then(
    (): TagMutationResult => ({ ok: true }),
    (e): TagMutationResult => ({
      ok: false,
      error: { message: e instanceof Error ? e.message : 'unknown error' },
    }),
  )
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export const getTagsState = createServerFn({ method: 'GET' }).handler(
  (): Promise<GetTagsStateResult> => readTagsState(storeDeps()),
)

export const createTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; colorId: string }) => ({
    name: str(data?.name),
    colorId: str(data?.colorId),
  }))
  .handler(
    ({ data }): Promise<TagMutationResult> =>
      toMutationResult(() =>
        createTagDefinition(
          { id: randomUUID(), name: data.name, colorId: data.colorId },
          storeDeps(),
        ),
      ),
  )

export const updateTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; name?: string; colorId?: string }) => ({
    id: str(data?.id),
    name: typeof data?.name === 'string' ? data.name : undefined,
    colorId: typeof data?.colorId === 'string' ? data.colorId : undefined,
  }))
  .handler(
    ({ data }): Promise<TagMutationResult> =>
      toMutationResult(() =>
        updateTagDefinition(data.id, { name: data.name, colorId: data.colorId }, storeDeps()),
      ),
  )

export const deleteTag = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => ({ id: str(data?.id) }))
  .handler(
    ({ data }): Promise<TagMutationResult> =>
      toMutationResult(() => deleteTagDefinition(data.id, storeDeps())),
  )

export const attachTagToTicket = createServerFn({ method: 'POST' })
  .inputValidator((data: { issueKey: string; tagId: string }) => ({
    issueKey: assertIssueKey(str(data?.issueKey), 'attachTagToTicket'),
    tagId: str(data?.tagId),
  }))
  .handler(
    ({ data }): Promise<TagMutationResult> =>
      toMutationResult(() => attachTag(data.issueKey, data.tagId, storeDeps())),
  )

export const detachTagFromTicket = createServerFn({ method: 'POST' })
  .inputValidator((data: { issueKey: string; tagId: string }) => ({
    issueKey: assertIssueKey(str(data?.issueKey), 'detachTagFromTicket'),
    tagId: str(data?.tagId),
  }))
  .handler(
    ({ data }): Promise<TagMutationResult> =>
      toMutationResult(() => detachTag(data.issueKey, data.tagId, storeDeps())),
  )
