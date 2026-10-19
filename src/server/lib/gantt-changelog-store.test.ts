import { describe, expect, it } from 'vitest'
import {
  appendChartChangelog,
  chartChangelogFilePath,
  readChartChangelog,
  type GanttChangelogEntry,
  type GanttChangelogStoreDeps,
} from './gantt-changelog-store'

const HOME = '/home/me'
const PATH = chartChangelogFilePath(HOME, 'tier-migration')

function fakeStore(seed?: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(seed ?? {}))
  const dirs = new Set<string>()
  const deps: GanttChangelogStoreDeps = {
    homeDir: HOME,
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
  return { deps, files, dirs }
}

const entry = (
  summary: string,
  actor: GanttChangelogEntry['actor'] = 'agent',
  at = '2026-10-19T09:00:00.000Z',
): GanttChangelogEntry => ({ at, actor, summary })

describe('chartChangelogFilePath', () => {
  it('sits beside chart.json in the chart folder', () => {
    expect(PATH).toBe('/home/me/.clashboard/gantt/tier-migration/chart.changelog.json')
  })

  it('rejects an invalid chart id rather than shaping a path from it', () => {
    expect(() => chartChangelogFilePath(HOME, '../secrets')).toThrow(/invalid chart id/u)
  })
})

describe('readChartChangelog', () => {
  it.each([
    ['a missing file', undefined],
    ['a corrupt (non-JSON) file', 'not json'],
    ['a file holding something other than a list', '{"at":"now"}'],
  ])('reads %s as the empty changelog', async (_label, raw) => {
    const { deps } = fakeStore(raw === undefined ? undefined : { [PATH]: raw })
    expect(await readChartChangelog('tier-migration', deps)).toEqual([])
  })

  it('drops malformed entries but keeps well-formed ones', async () => {
    const raw = JSON.stringify([
      entry('good'),
      { at: 5, actor: 'agent', summary: 'x' },
      { at: 'now', summary: 'no actor' },
      { at: 'now', actor: 'gremlin', summary: 'unknown actor' },
      'nope',
    ])
    const { deps } = fakeStore({ [PATH]: raw })
    expect(await readChartChangelog('tier-migration', deps)).toEqual([entry('good')])
  })

  it.each(['agent', 'sync', 'user'] as const)('keeps a %s entry', async (actor) => {
    const { deps } = fakeStore({ [PATH]: JSON.stringify([entry('did a thing', actor)]) })
    expect(await readChartChangelog('tier-migration', deps)).toEqual([entry('did a thing', actor)])
  })
})

describe('appendChartChangelog', () => {
  it('creates the chart folder and writes the first entry', async () => {
    const { deps, files, dirs } = fakeStore()
    const result = await appendChartChangelog('tier-migration', entry('created the chart'), deps)
    expect(result).toEqual([entry('created the chart')])
    expect(dirs.has('/home/me/.clashboard/gantt/tier-migration')).toBe(true)
    expect(JSON.parse(files.get(PATH)!)).toEqual([entry('created the chart')])
  })

  it('appends in order, oldest first', async () => {
    const { deps } = fakeStore()
    await appendChartChangelog(
      'tier-migration',
      entry('one', 'agent', '2026-01-01T00:00:00.000Z'),
      deps,
    )
    await appendChartChangelog(
      'tier-migration',
      entry('two', 'sync', '2026-02-01T00:00:00.000Z'),
      deps,
    )
    const result = await appendChartChangelog(
      'tier-migration',
      entry('three', 'user', '2026-03-01T00:00:00.000Z'),
      deps,
    )
    expect(result.map((e) => e.summary)).toEqual(['one', 'two', 'three'])
    expect(result.map((e) => e.actor)).toEqual(['agent', 'sync', 'user'])
  })

  it('does not lose prior entries when the file already holds some', async () => {
    const { deps } = fakeStore({ [PATH]: JSON.stringify([entry('earlier')]) })
    const result = await appendChartChangelog('tier-migration', entry('later'), deps)
    expect(result.map((e) => e.summary)).toEqual(['earlier', 'later'])
  })

  it('rejects an invalid chart id', async () => {
    const { deps } = fakeStore()
    await expect(appendChartChangelog('../escape', entry('x'), deps)).rejects.toThrow(
      /invalid chart id/u,
    )
  })
})
