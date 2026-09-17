import { describe, expect, it } from 'vitest'
import {
  readWatchlistLanes,
  setWatchlistLanes,
  watchlistLanesDir,
  watchlistLanesFilePath,
  type WatchlistLanesStoreDeps,
} from './watchlist-lanes-store'

function fakeStore(initial?: string) {
  const homeDir = '/home/me'
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  if (initial !== undefined) files.set(watchlistLanesFilePath(homeDir), initial)
  const deps: WatchlistLanesStoreDeps = {
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

describe('readWatchlistLanes', () => {
  it('returns the empty configuration when the file does not exist', async () => {
    const { deps } = fakeStore()
    expect(await readWatchlistLanes(deps)).toEqual({ lanes: [] })
  })

  it('returns the empty configuration when the file is malformed JSON', async () => {
    const { deps } = fakeStore('not json {')
    expect(await readWatchlistLanes(deps)).toEqual({ lanes: [] })
  })

  it('parses lanes in order, cleans tag ids, and drops tagless / id-less lanes', async () => {
    const { deps } = fakeStore(
      JSON.stringify({
        lanes: [
          { id: 'l1', tagIds: ['a', 'b', 'a', 3, ''] },
          { id: '', tagIds: ['c'] },
          { id: 'l2', tagIds: [] },
          { id: 'l3', tagIds: ['c'] },
        ],
      }),
    )
    expect(await readWatchlistLanes(deps)).toEqual({
      lanes: [
        { id: 'l1', tagIds: ['a', 'b'] },
        { id: 'l3', tagIds: ['c'] },
      ],
    })
  })

  it('dedupes lanes by id (first wins)', async () => {
    const { deps } = fakeStore(
      JSON.stringify({
        lanes: [
          { id: 'l1', tagIds: ['a'] },
          { id: 'l1', tagIds: ['b'] },
        ],
      }),
    )
    expect(await readWatchlistLanes(deps)).toEqual({ lanes: [{ id: 'l1', tagIds: ['a'] }] })
  })

  it('migrates the old single-tag laneTagIds shape to one-tag lanes', async () => {
    const { deps } = fakeStore(JSON.stringify({ laneTagIds: ['a', 'b', 'a'] }))
    expect(await readWatchlistLanes(deps)).toEqual({
      lanes: [
        { id: 'a', tagIds: ['a'] },
        { id: 'b', tagIds: ['b'] },
      ],
    })
  })
})

describe('setWatchlistLanes', () => {
  it('replaces the list, persists it, and creates the directory', async () => {
    const { deps, files, dirs, homeDir } = fakeStore()
    const next = await setWatchlistLanes([{ id: 'l1', tagIds: ['a', 'b'] }], deps)
    expect(next).toEqual({ lanes: [{ id: 'l1', tagIds: ['a', 'b'] }] })
    expect(dirs.has(watchlistLanesDir(homeDir))).toBe(true)
    expect(JSON.parse(files.get(watchlistLanesFilePath(homeDir))!)).toEqual({
      lanes: [{ id: 'l1', tagIds: ['a', 'b'] }],
    })
  })

  it('drops tagless lanes on write', async () => {
    const { deps } = fakeStore()
    expect(
      await setWatchlistLanes(
        [
          { id: 'l1', tagIds: ['a'] },
          { id: 'l2', tagIds: [] },
        ],
        deps,
      ),
    ).toEqual({ lanes: [{ id: 'l1', tagIds: ['a'] }] })
  })

  it('can clear the configuration', async () => {
    const { deps } = fakeStore(JSON.stringify({ lanes: [{ id: 'l1', tagIds: ['a'] }] }))
    expect(await setWatchlistLanes([], deps)).toEqual({ lanes: [] })
  })
})
