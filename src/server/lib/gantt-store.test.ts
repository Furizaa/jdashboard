import { describe, expect, it } from 'vitest'
import type { GanttChart } from './gantt-schema'
import {
  archiveChart,
  bodyFilePath,
  bodyNodeIds,
  bodyPrevFilePath,
  chartDir,
  chartFilePath,
  archiveDir,
  ganttDir,
  hasBody,
  listCharts,
  readBody,
  readChart,
  writeBody,
  writeChart,
  type GanttStoreDeps,
} from './gantt-store'

const HOME = '/home/me'
const NOW = '2026-10-19T09:00:00.000Z'

// A fake filesystem over two maps. `readDir` derives a directory's children from
// the paths of the files under it, which is what makes `listCharts` (one read of
// `gantt/`) and `bodyNodeIds` (one read of `bodies/`) testable without stubbing
// each one's answer.
function fakeStore(seed?: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(seed ?? {}))
  const dirs = new Set<string>()

  function childrenOf(dir: string): Set<string> {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`
    const names = new Set<string>()
    for (const path of [...files.keys(), ...dirs]) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      if (rest === '') continue
      const slash = rest.indexOf('/')
      names.add(slash === -1 ? rest : rest.slice(0, slash))
    }
    return names
  }

  const deps: GanttStoreDeps = {
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
    readDir: (p) => {
      const names = childrenOf(p)
      if (names.size === 0 && !dirs.has(p)) return Promise.reject(new Error('ENOENT'))
      return Promise.resolve([...names])
    },
    rename: (from, to) => {
      const prefix = `${from}/`
      const under = (path: string) => path === from || path.startsWith(prefix)
      const moved = (path: string) => (path === from ? to : `${to}/${path.slice(prefix.length)}`)
      // Collected before anything moves: deleting from a map while iterating it
      // is the one thing a fake filesystem must not do.
      const movedFiles = [...files.entries()].filter(([path]) => under(path))
      const movedDirs = [...dirs].filter(under)
      for (const [path, data] of movedFiles) {
        files.delete(path)
        files.set(moved(path), data)
      }
      for (const dir of movedDirs) {
        dirs.delete(dir)
        dirs.add(moved(dir))
      }
      return Promise.resolve()
    },
    now: () => NOW,
  }
  return { deps, files, dirs }
}

function chart(overrides: Partial<GanttChart> = {}): GanttChart {
  return {
    version: 1,
    id: 'tier-migration',
    title: 'Tier migration',
    jiraSources: ['GEO-120'],
    lastSyncedAt: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    nodes: [
      {
        id: 'prd-tiering',
        parentId: null,
        order: 0,
        title: 'Tiering PRD',
        source: { kind: 'local' },
        start: '2026-10-01',
        end: '2026-12-31',
        column: 'In Implementation',
        status: null,
        assignee: null,
        discovered: false,
        orphaned: false,
      },
      {
        id: 'geo-412',
        parentId: 'prd-tiering',
        order: 1,
        title: 'Split the pricing service',
        source: { kind: 'jira', key: 'GEO-412' },
        start: null,
        end: null,
        column: 'Done',
        status: 'In STG',
        assignee: 'Andreas Hoffmann',
        discovered: false,
        orphaned: false,
      },
    ],
    edges: [{ id: 'e1', from: 'prd-tiering', to: 'geo-412', source: { kind: 'local' } }],
    ...overrides,
  }
}

function chartFile(value: GanttChart): Record<string, string> {
  return { [chartFilePath(HOME, value.id)]: JSON.stringify(value) }
}

/**
 * A chart exactly as it sat on disk before `discovered` existed. Two real charts
 * were in `~/.clashboard/gantt/` when the field was added, and `readChart` treats
 * an invalid chart as **absent** — so a migration that failed would not raise, it
 * would make a plan nobody has another copy of disappear from the app.
 */
function withoutDiscovered(value: GanttChart): Record<string, unknown> {
  return {
    ...value,
    nodes: value.nodes.map((node) => {
      const { discovered: _discovered, ...rest } = node
      return rest
    }),
  }
}

describe('paths', () => {
  it('place one folder per chart under ~/.clashboard/gantt', () => {
    expect(ganttDir(HOME)).toBe('/home/me/.clashboard/gantt')
    expect(chartDir(HOME, 'tier-migration')).toBe('/home/me/.clashboard/gantt/tier-migration')
    expect(chartFilePath(HOME, 'tier-migration')).toBe(
      '/home/me/.clashboard/gantt/tier-migration/chart.json',
    )
    expect(archiveDir(HOME)).toBe('/home/me/.clashboard/gantt/.archive')
  })

  it('place one markdown body per node, with its snapshot beside it', () => {
    expect(bodyFilePath(HOME, 'tier-migration', 'prd-tiering')).toBe(
      '/home/me/.clashboard/gantt/tier-migration/bodies/prd-tiering.md',
    )
    expect(bodyPrevFilePath(HOME, 'tier-migration', 'prd-tiering')).toBe(
      '/home/me/.clashboard/gantt/tier-migration/bodies/prd-tiering.md.prev',
    )
  })

  it('rejects a traversal rather than shaping a path from it', () => {
    expect(() => chartDir(HOME, '../escape')).toThrow(/chartDir: invalid chart id/u)
    expect(() => chartFilePath(HOME, '../escape')).toThrow(/invalid chart id/u)
    expect(() => bodyFilePath(HOME, 'tier-migration', '../../etc/passwd')).toThrow(
      /bodyFilePath: invalid node id/u,
    )
    expect(() => bodyPrevFilePath(HOME, 'tier-migration', '..')).toThrow(/invalid node id/u)
  })
})

describe('readChart', () => {
  it.each([
    ['a valid chart.json', JSON.stringify(chart()), true],
    ['a corrupt chart.json', '{ not json', false],
    ['a chart.json that is not an object', '"a chart, surely"', false],
    ['a chart.json of the wrong version', JSON.stringify({ ...chart(), version: 2 }), false],
    [
      'a chart.json with a bad date',
      JSON.stringify({
        ...chart(),
        nodes: [{ ...chart().nodes[0]!, start: 'next week' }],
        edges: [],
      }),
      false,
    ],
    [
      'a chart.json whose id is not the folder name',
      JSON.stringify({ ...chart(), id: 'other' }),
      false,
    ],
    // The schema addition that could have made two real charts vanish.
    [
      'a chart.json written before nodes had a discovered flag',
      JSON.stringify(withoutDiscovered(chart())),
      true,
    ],
  ])('reads %s as %s', async (_label, raw, expected) => {
    const { deps } = fakeStore({ [chartFilePath(HOME, 'tier-migration')]: raw })
    expect((await readChart('tier-migration', deps)) !== null).toBe(expected)
  })

  it('reads a missing chart as null rather than throwing', async () => {
    const { deps } = fakeStore()
    expect(await readChart('tier-migration', deps)).toBeNull()
  })

  it('returns the validated chart, not the raw JSON', async () => {
    const { deps } = fakeStore(chartFile(chart()))
    const read = await readChart('tier-migration', deps)
    expect(read).toEqual(chart())
  })

  // Loading is half of it: the field has to arrive, and arrive `false`, or every
  // mirrored lane on a pre-existing chart would be orphan-eligible on the first
  // sync on the strength of a key `undefined`.
  it('fills discovered with false on a chart written before the field existed', async () => {
    const { deps } = fakeStore({
      [chartFilePath(HOME, 'tier-migration')]: JSON.stringify(withoutDiscovered(chart())),
    })
    const read = await readChart('tier-migration', deps)
    expect(read?.nodes.map((node) => [node.id, node.discovered])).toEqual([
      ['prd-tiering', false],
      ['geo-412', false],
    ])
    expect(read?.nodes.every((node) => Object.hasOwn(node, 'discovered'))).toBe(true)
  })

  it('rejects an unguarded chart id before it reaches the filesystem', async () => {
    const { deps } = fakeStore()
    await expect(readChart('../escape', deps)).rejects.toThrow(/invalid chart id/u)
  })
})

describe('writeChart', () => {
  it('creates the chart folder and writes chart.json', async () => {
    const { deps, files, dirs } = fakeStore()
    await writeChart(chart(), deps)
    expect(dirs.has(chartDir(HOME, 'tier-migration'))).toBe(true)
    expect(await readChart('tier-migration', deps)).toEqual(chart())
    expect(files.get(chartFilePath(HOME, 'tier-migration'))?.endsWith('\n')).toBe(true)
  })
})

describe('listCharts', () => {
  it('returns [] when nothing has ever been charted', async () => {
    const { deps } = fakeStore()
    expect(await listCharts(deps)).toEqual([])
  })

  it('summarises each chart with its node and done counts', async () => {
    const { deps } = fakeStore({
      ...chartFile(chart()),
      ...chartFile(chart({ id: 'platform-q1', title: 'Platform Q1', nodes: [], edges: [] })),
    })
    expect(await listCharts(deps)).toEqual([
      {
        id: 'platform-q1',
        title: 'Platform Q1',
        jiraSources: ['GEO-120'],
        lastSyncedAt: null,
        nodeCount: 0,
        doneCount: 0,
      },
      {
        id: 'tier-migration',
        title: 'Tier migration',
        jiraSources: ['GEO-120'],
        lastSyncedAt: null,
        nodeCount: 2,
        doneCount: 1,
      },
    ])
  })

  it('skips a chart whose chart.json is corrupt rather than breaking the list', async () => {
    const { deps } = fakeStore({
      ...chartFile(chart()),
      [chartFilePath(HOME, 'broken-chart')]: '{ "version": 1, "nodes": ',
    })
    expect((await listCharts(deps)).map((c) => c.id)).toEqual(['tier-migration'])
  })

  it('skips a folder with no chart.json at all', async () => {
    const { deps } = fakeStore({
      ...chartFile(chart()),
      [`${chartDir(HOME, 'half-made')}/bodies/prd-x.md`]: '# draft',
    })
    expect((await listCharts(deps)).map((c) => c.id)).toEqual(['tier-migration'])
  })

  it('excludes .archive', async () => {
    const { deps } = fakeStore({
      ...chartFile(chart()),
      [`${archiveDir(HOME)}/old-chart/chart.json`]: JSON.stringify(chart({ id: 'old-chart' })),
    })
    expect((await listCharts(deps)).map((c) => c.id)).toEqual(['tier-migration'])
  })
})

describe('readBody / writeBody', () => {
  it('reads a node with no body as null', async () => {
    const { deps } = fakeStore(chartFile(chart()))
    expect(await readBody('tier-migration', 'prd-tiering', deps)).toBeNull()
  })

  it('round-trips the markdown verbatim', async () => {
    const { deps } = fakeStore()
    await writeBody('tier-migration', 'prd-tiering', '# Tiering\n\n- a\n', deps)
    expect(await readBody('tier-migration', 'prd-tiering', deps)).toBe('# Tiering\n\n- a\n')
  })

  it('does not create a .prev when there was no body', async () => {
    const { deps, files } = fakeStore()
    await writeBody('tier-migration', 'prd-tiering', 'first draft', deps)
    expect(files.has(bodyPrevFilePath(HOME, 'tier-migration', 'prd-tiering'))).toBe(false)
  })

  it('snapshots the existing body to .prev before overwriting it', async () => {
    const { deps, files } = fakeStore()
    await writeBody('tier-migration', 'prd-tiering', 'the PRD I wrote', deps)
    await writeBody('tier-migration', 'prd-tiering', 'what the agent made of it', deps)
    expect(files.get(bodyPrevFilePath(HOME, 'tier-migration', 'prd-tiering'))).toBe(
      'the PRD I wrote',
    )
    expect(await readBody('tier-migration', 'prd-tiering', deps)).toBe('what the agent made of it')
  })

  it('keeps only one level — a third write snapshots the second, not the first', async () => {
    const { deps, files } = fakeStore()
    await writeBody('tier-migration', 'prd-tiering', 'one', deps)
    await writeBody('tier-migration', 'prd-tiering', 'two', deps)
    await writeBody('tier-migration', 'prd-tiering', 'three', deps)
    expect(files.get(bodyPrevFilePath(HOME, 'tier-migration', 'prd-tiering'))).toBe('two')
  })

  it('rejects an unguarded node id before it reaches the filesystem', async () => {
    const { deps } = fakeStore()
    await expect(writeBody('tier-migration', '../escape', 'x', deps)).rejects.toThrow(
      /invalid node id/u,
    )
  })
})

describe('bodyNodeIds / hasBody', () => {
  it('reads an empty bodies directory as no bodies', async () => {
    const { deps } = fakeStore(chartFile(chart()))
    expect(await bodyNodeIds('tier-migration', deps)).toEqual([])
    expect(await hasBody('tier-migration', 'prd-tiering', deps)).toBe(false)
  })

  it('derives every hasBody from one directory read, ignoring snapshots', async () => {
    const { deps } = fakeStore()
    await writeBody('tier-migration', 'prd-tiering', 'one', deps)
    await writeBody('tier-migration', 'prd-tiering', 'two', deps)
    await writeBody('tier-migration', 'geo-412', 'ticket notes', deps)
    expect((await bodyNodeIds('tier-migration', deps)).toSorted()).toEqual([
      'geo-412',
      'prd-tiering',
    ])
    expect(await hasBody('tier-migration', 'geo-412', deps)).toBe(true)
    expect(await hasBody('tier-migration', 'prd-unwritten', deps)).toBe(false)
  })
})

describe('archiveChart', () => {
  it('moves the whole folder under .archive', async () => {
    const { deps, files } = fakeStore(chartFile(chart()))
    await writeBody('tier-migration', 'prd-tiering', '# Tiering', deps)

    const to = await archiveChart('tier-migration', deps)

    expect(to).toBe(`${archiveDir(HOME)}/tier-migration`)
    expect(files.has(chartFilePath(HOME, 'tier-migration'))).toBe(false)
    expect(files.get(`${to}/chart.json`)).toBeDefined()
    expect(files.get(`${to}/bodies/prd-tiering.md`)).toBe('# Tiering')
    expect(await listCharts(deps)).toEqual([])
  })

  it('does not overwrite an existing archive entry of the same id', async () => {
    const { deps, files } = fakeStore({
      ...chartFile(chart()),
      [`${archiveDir(HOME)}/tier-migration/chart.json`]: 'the chart archived last month',
    })

    const to = await archiveChart('tier-migration', deps)

    expect(to).toBe(`${archiveDir(HOME)}/tier-migration-20261019t090000000z`)
    expect(files.get(`${archiveDir(HOME)}/tier-migration/chart.json`)).toBe(
      'the chart archived last month',
    )
    expect(files.get(`${to}/chart.json`)).toContain('"Tier migration"')
  })

  it('rejects an unguarded chart id before renaming anything', async () => {
    const { deps } = fakeStore()
    await expect(archiveChart('../escape', deps)).rejects.toThrow(/invalid chart id/u)
  })
})
