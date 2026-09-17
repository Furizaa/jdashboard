import { describe, expect, it } from 'vitest'
import {
  assertTagName,
  attachTag,
  createTagDefinition,
  deleteTagDefinition,
  detachTag,
  readTagsState,
  tagsFilePath,
  updateTagDefinition,
  type TagsState,
  type TagsStoreDeps,
} from './tags-store'

function fakeStore(initial?: TagsState | string) {
  const homeDir = '/home/me'
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  if (initial !== undefined) {
    files.set(
      tagsFilePath(homeDir),
      typeof initial === 'string' ? initial : JSON.stringify(initial),
    )
  }
  const deps: TagsStoreDeps = {
    homeDir,
    readFile: (p) => {
      const v = files.get(p)
      return v === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(v)
    },
    writeFile: (p, data) => {
      files.set(p, data)
      return Promise.resolve()
    },
    mkdir: (p) => {
      dirs.add(p)
      return Promise.resolve()
    },
  }
  return { deps, files, dirs, homeDir }
}

const def = (id: string, name = id, colorId = 'blue') => ({ id, name, colorId })

describe('readTagsState', () => {
  it('returns the empty state when the file does not exist', async () => {
    const { deps } = fakeStore()
    expect(await readTagsState(deps)).toEqual({ definitions: [], attachments: {} })
  })

  it('returns the empty state on malformed JSON', async () => {
    const { deps } = fakeStore('not json {')
    expect(await readTagsState(deps)).toEqual({ definitions: [], attachments: {} })
  })

  it('drops malformed definitions and dedupes by id', async () => {
    const { deps } = fakeStore(
      JSON.stringify({
        definitions: [def('a'), { id: 'b' }, def('a', 'dupe'), 42],
        attachments: {},
      }),
    )
    const state = await readTagsState(deps)
    expect(state.definitions.map((d) => d.id)).toEqual(['a'])
  })

  it('drops attachment ids with no matching definition', async () => {
    const { deps } = fakeStore(
      JSON.stringify({
        definitions: [def('a')],
        attachments: { 'HDR-1': ['a', 'ghost', 7], 'HDR-2': ['ghost'] },
      }),
    )
    const state = await readTagsState(deps)
    expect(state.attachments).toEqual({ 'HDR-1': ['a'] })
  })
})

describe('createTagDefinition', () => {
  it('appends, trims the name, persists, and creates the directory', async () => {
    const { deps, files, dirs, homeDir } = fakeStore()
    const next = await createTagDefinition({ id: 'a', name: '  Blocked  ', colorId: 'red' }, deps)
    expect(next.definitions).toEqual([{ id: 'a', name: 'Blocked', colorId: 'red' }])
    expect(dirs.has(`${homeDir}/.clashboard`)).toBe(true)
    expect(files.get(tagsFilePath(homeDir))).toContain('"Blocked"')
  })

  it('is idempotent on a duplicate id', async () => {
    const { deps } = fakeStore({ definitions: [def('a', 'first')], attachments: {} })
    const next = await createTagDefinition({ id: 'a', name: 'second', colorId: 'red' }, deps)
    expect(next.definitions).toEqual([def('a', 'first')])
  })

  it('rejects an empty name', async () => {
    const { deps } = fakeStore()
    await expect(
      createTagDefinition({ id: 'a', name: '   ', colorId: 'red' }, deps),
    ).rejects.toThrow(/must not be empty/)
  })
})

describe('updateTagDefinition', () => {
  it('renames and recolours in place', async () => {
    const { deps } = fakeStore({ definitions: [def('a', 'old', 'blue')], attachments: {} })
    const next = await updateTagDefinition('a', { name: 'new', colorId: 'green' }, deps)
    expect(next.definitions).toEqual([{ id: 'a', name: 'new', colorId: 'green' }])
  })

  it('is a no-op for an unknown id', async () => {
    const { deps } = fakeStore({ definitions: [def('a')], attachments: {} })
    const next = await updateTagDefinition('zzz', { name: 'x' }, deps)
    expect(next.definitions).toEqual([def('a')])
  })
})

describe('deleteTagDefinition', () => {
  it('removes the definition and cascades into attachments', async () => {
    const { deps } = fakeStore({
      definitions: [def('a'), def('b')],
      attachments: { 'HDR-1': ['a', 'b'], 'HDR-2': ['a'] },
    })
    const next = await deleteTagDefinition('a', deps)
    expect(next.definitions.map((d) => d.id)).toEqual(['b'])
    expect(next.attachments).toEqual({ 'HDR-1': ['b'] })
  })
})

describe('attachTag / detachTag', () => {
  it('attaches idempotently and validates the issue key', async () => {
    const { deps } = fakeStore({ definitions: [def('a')], attachments: {} })
    let state = await attachTag('HDR-1', 'a', deps)
    expect(state.attachments).toEqual({ 'HDR-1': ['a'] })
    state = await attachTag('HDR-1', 'a', deps)
    expect(state.attachments).toEqual({ 'HDR-1': ['a'] })
    await expect(attachTag('not a key', 'a', deps)).rejects.toThrow(/invalid issue key/)
  })

  it('rejects attaching an unknown tag id', async () => {
    const { deps } = fakeStore({ definitions: [def('a')], attachments: {} })
    await expect(attachTag('HDR-1', 'ghost', deps)).rejects.toThrow(/unknown tag id/)
  })

  it('detaches and drops the now-empty list', async () => {
    const { deps } = fakeStore({ definitions: [def('a')], attachments: { 'HDR-1': ['a'] } })
    const state = await detachTag('HDR-1', 'a', deps)
    expect(state.attachments).toEqual({})
  })
})

describe('assertTagName', () => {
  it('rejects names over the length cap', async () => {
    expect(() => assertTagName('x'.repeat(41), 'test')).toThrow(/at most/)
  })
})
