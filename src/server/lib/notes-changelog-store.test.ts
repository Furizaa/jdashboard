import { describe, expect, it } from 'vitest'
import {
  appendChangelog,
  changelogFilePath,
  readChangelog,
  type ChangelogStoreDeps,
} from './notes-changelog-store'

function fakeStore(seed?: Record<string, string>) {
  const homeDir = '/home/me'
  const files = new Map<string, string>(Object.entries(seed ?? {}))
  const dirs = new Set<string>()
  const deps: ChangelogStoreDeps = {
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

const entry = (summary: string, at = '2026-09-16T10:00:00.000Z') => ({ at, summary })

describe('changelogFilePath', () => {
  it('sits beside the note as <key>.changelog.json', () => {
    expect(changelogFilePath('/home/me', 'HDR-42')).toBe(
      '/home/me/.clashboard/notes/HDR-42.changelog.json',
    )
  })

  it('rejects an invalid issue key rather than shaping a path from it', () => {
    expect(() => changelogFilePath('/home/me', '../secrets')).toThrow(/invalid issue key/u)
  })
})

describe('readChangelog', () => {
  it('returns [] when no changelog file exists', async () => {
    const { deps } = fakeStore()
    expect(await readChangelog('HDR-1', deps)).toEqual([])
  })

  it('returns [] for a corrupt (non-JSON) file rather than throwing', async () => {
    const { deps } = fakeStore({ [changelogFilePath('/home/me', 'HDR-1')]: 'not json' })
    expect(await readChangelog('HDR-1', deps)).toEqual([])
  })

  it('drops malformed entries but keeps well-formed ones', async () => {
    const path = changelogFilePath('/home/me', 'HDR-1')
    const raw = JSON.stringify([entry('good'), { at: 5 }, { summary: 'no at' }, 'nope'])
    const { deps } = fakeStore({ [path]: raw })
    expect(await readChangelog('HDR-1', deps)).toEqual([entry('good')])
  })
})

describe('appendChangelog', () => {
  it('creates the notes dir and writes the first entry', async () => {
    const { deps, files, dirs } = fakeStore()
    const result = await appendChangelog('HDR-1', entry('first'), deps)
    expect(result).toEqual([entry('first')])
    expect(dirs.has('/home/me/.clashboard/notes')).toBe(true)
    expect(JSON.parse(files.get(changelogFilePath('/home/me', 'HDR-1'))!)).toEqual([entry('first')])
  })

  it('appends to existing entries, preserving order (oldest first)', async () => {
    const path = changelogFilePath('/home/me', 'HDR-1')
    const { deps } = fakeStore({
      [path]: JSON.stringify([entry('one', '2026-01-01T00:00:00.000Z')]),
    })
    const result = await appendChangelog('HDR-1', entry('two', '2026-02-01T00:00:00.000Z'), deps)
    expect(result.map((e) => e.summary)).toEqual(['one', 'two'])
  })
})
