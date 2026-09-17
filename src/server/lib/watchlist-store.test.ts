import { describe, expect, it } from 'vitest'
import {
  addWatchlistKey,
  readWatchlistKeys,
  removeWatchlistKey,
  watchlistDir,
  watchlistFilePath,
  type WatchlistStoreDeps,
} from './watchlist-store'

function fakeStore(initial?: string) {
  const homeDir = '/home/me'
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  if (initial !== undefined) files.set(watchlistFilePath(homeDir), initial)
  const deps: WatchlistStoreDeps = {
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

describe('readWatchlistKeys', () => {
  it('returns [] when the file does not exist', async () => {
    const { deps } = fakeStore()
    expect(await readWatchlistKeys(deps)).toEqual([])
  })

  it('returns [] when the file is malformed JSON', async () => {
    const { deps } = fakeStore('not json {')
    expect(await readWatchlistKeys(deps)).toEqual([])
  })

  it('returns [] when the shape is not { keys: [...] }', async () => {
    const { deps } = fakeStore(JSON.stringify(['HDR-1']))
    expect(await readWatchlistKeys(deps)).toEqual([])
  })

  it('parses keys, drops non-strings, and dedupes', async () => {
    const { deps } = fakeStore(JSON.stringify({ keys: ['HDR-1', 'HDR-2', 'HDR-1', 3] }))
    expect(await readWatchlistKeys(deps)).toEqual(['HDR-1', 'HDR-2'])
  })
})

describe('addWatchlistKey', () => {
  it('appends the key, persists it, and creates the directory', async () => {
    const { deps, files, dirs, homeDir } = fakeStore()
    const next = await addWatchlistKey('HDR-1', deps)
    expect(next).toEqual(['HDR-1'])
    expect(dirs.has(watchlistDir(homeDir))).toBe(true)
    expect(JSON.parse(files.get(watchlistFilePath(homeDir))!)).toEqual({ keys: ['HDR-1'] })
  })

  it('is idempotent — adding an existing key does not duplicate it', async () => {
    const { deps } = fakeStore(JSON.stringify({ keys: ['HDR-1'] }))
    expect(await addWatchlistKey('HDR-1', deps)).toEqual(['HDR-1'])
  })

  it('rejects an invalid issue key', async () => {
    const { deps } = fakeStore()
    await expect(addWatchlistKey('not-a-key', deps)).rejects.toThrow(/invalid issue key/u)
  })
})

describe('removeWatchlistKey', () => {
  it('removes the key and persists the remainder', async () => {
    const { deps, files, homeDir } = fakeStore(JSON.stringify({ keys: ['HDR-1', 'HDR-2'] }))
    const next = await removeWatchlistKey('HDR-1', deps)
    expect(next).toEqual(['HDR-2'])
    expect(JSON.parse(files.get(watchlistFilePath(homeDir))!)).toEqual({ keys: ['HDR-2'] })
  })

  it('is a no-op when the key is absent', async () => {
    const { deps, files, homeDir } = fakeStore(JSON.stringify({ keys: ['HDR-1'] }))
    expect(await removeWatchlistKey('HDR-9', deps)).toEqual(['HDR-1'])
    // unchanged file
    expect(JSON.parse(files.get(watchlistFilePath(homeDir))!)).toEqual({ keys: ['HDR-1'] })
  })
})
