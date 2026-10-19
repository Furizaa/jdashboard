import { describe, expect, it } from 'vitest'
import { readChartChangelog } from './gantt-changelog-store'
import { GANTT_CHART_VERSION, type GanttChart, type GanttNode } from './gantt-schema'
import { bodyFilePath, bodyPrevFilePath, readChart, writeChart } from './gantt-store'
import {
  createGanttWrites,
  deleteBodyFiles,
  recordChange,
  type GanttWrites,
  type GanttWritesDeps,
} from './gantt-writes'

const HOME = '/home/me'
const NOW = '2026-10-19T09:00:00.000Z'

// The same two-map fake filesystem `gantt-store.test.ts` uses, plus the one verb
// the writes module adds. Kept local rather than shared: the store's copy is
// exercising the store, and a fixture shared between two suites is a third thing
// to keep in step.
function fakeDeps(seed?: Record<string, string>) {
  const files = new Map<string, string>(Object.entries(seed ?? {}))

  const deps: GanttWritesDeps = {
    homeDir: HOME,
    readFile: (p) => {
      const v = files.get(p)
      return v === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(v)
    },
    writeFile: (p, data) => {
      files.set(p, data)
      return Promise.resolve()
    },
    mkdir: () => Promise.resolve(),
    readDir: (p) => {
      const prefix = `${p}/`
      const names = new Set<string>()
      for (const path of files.keys()) {
        if (!path.startsWith(prefix)) continue
        const rest = path.slice(prefix.length)
        names.add(rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest)
      }
      return Promise.resolve([...names])
    },
    rename: () => Promise.resolve(),
    deleteFile: (p) => {
      if (!files.has(p)) return Promise.reject(new Error('ENOENT'))
      files.delete(p)
      return Promise.resolve()
    },
    now: () => NOW,
  }
  return { deps, files }
}

function chart(id: string): GanttChart {
  return {
    version: GANTT_CHART_VERSION,
    id,
    title: `Chart ${id}`,
    jiraSources: [],
    lastSyncedAt: null,
    createdAt: NOW,
    nodes: [],
    edges: [],
  }
}

function node(id: string): GanttNode {
  return {
    id,
    parentId: null,
    order: 0,
    title: id,
    source: { kind: 'local' },
    start: null,
    end: null,
    column: 'TO DO',
    status: null,
    assignee: null,
    discovered: false,
    orphaned: false,
  }
}

/** A macrotask, so an interleaving actually gets the chance to interleave. */
const tick = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })

/**
 * The shape every write in this suite has: read the chart, pause long enough for
 * another writer to read the same thing, then write the chart back with one more
 * node. Outside a critical section this is the classic lost update.
 */
async function appendNodeSlowly(nodeId: string, chartId: string, deps: GanttWritesDeps) {
  const current = await readChart(chartId, deps)
  if (current === null) throw new Error(`no chart ${chartId}`)
  await tick()
  await writeChart({ ...current, nodes: [...current.nodes, node(nodeId)] }, deps)
}

async function nodeIdsOf(chartId: string, deps: GanttWritesDeps): Promise<string[]> {
  const stored = await readChart(chartId, deps)
  return (stored?.nodes ?? []).map((n) => n.id)
}

describe('withChartLock — the same chart', () => {
  it('serialises two concurrent writes so neither loses the other’s change', async () => {
    const { deps } = fakeDeps()
    const writes = createGanttWrites(deps)
    await writeChart(chart('plan'), deps)

    await Promise.all([
      writes.withChartLock('plan', () => appendNodeSlowly('first', 'plan', deps)),
      writes.withChartLock('plan', () => appendNodeSlowly('second', 'plan', deps)),
    ])

    expect(await nodeIdsOf('plan', deps)).toEqual(['first', 'second'])
  })

  // The control for the test above: without the lock the very same two writes
  // lose one of the two nodes. A passing concurrency test that would also pass
  // with the mechanism removed is not evidence of anything.
  it('is what makes the test above pass — unlocked, the same two writes lose one', async () => {
    const { deps } = fakeDeps()
    await writeChart(chart('plan'), deps)

    await Promise.all([
      appendNodeSlowly('first', 'plan', deps),
      appendNodeSlowly('second', 'plan', deps),
    ])

    expect(await nodeIdsOf('plan', deps)).toEqual(['second'])
  })

  it('runs queued writes in the order they arrived', async () => {
    const { deps } = fakeDeps()
    const writes = createGanttWrites(deps)
    const order: string[] = []
    const record = (label: string) => async () => {
      await tick()
      order.push(label)
    }

    await Promise.all([
      writes.withChartLock('plan', record('a')),
      writes.withChartLock('plan', record('b')),
      writes.withChartLock('plan', record('c')),
    ])

    expect(order).toEqual(['a', 'b', 'c'])
  })

  it('does not wedge a chart’s queue when a write fails', async () => {
    const { deps } = fakeDeps()
    const writes = createGanttWrites(deps)
    await writeChart(chart('plan'), deps)

    const failed = writes.withChartLock('plan', () => Promise.reject(new Error('disk full')))
    const after = writes.withChartLock('plan', () => appendNodeSlowly('after', 'plan', deps))

    await expect(failed).rejects.toThrow('disk full')
    await after
    expect(await nodeIdsOf('plan', deps)).toEqual(['after'])
  })

  it('starts a fresh chain once a chart has gone quiet', async () => {
    const { deps } = fakeDeps()
    const writes = createGanttWrites(deps)
    await writeChart(chart('plan'), deps)

    await writes.withChartLock('plan', () => appendNodeSlowly('first', 'plan', deps))
    await writes.withChartLock('plan', () => appendNodeSlowly('second', 'plan', deps))

    expect(await nodeIdsOf('plan', deps)).toEqual(['first', 'second'])
  })
})

describe('withChartLock — different charts', () => {
  // Stated as a deadlock rather than as timings: the write to `one` cannot
  // finish until the write to `two` has started. Under a global lock the second
  // write never starts, so this test hangs rather than merely being slow — which
  // is the honest way to assert "these do not wait on each other".
  it('does not serialise two charts', async () => {
    const { deps } = fakeDeps()
    const writes = createGanttWrites(deps)
    await writeChart(chart('one'), deps)
    await writeChart(chart('two'), deps)

    let release = () => {}
    const twoHasStarted = new Promise<void>((resolve) => {
      release = resolve
    })

    const first = writes.withChartLock('one', async () => {
      await twoHasStarted
      await appendNodeSlowly('from-one', 'one', deps)
    })
    const second = writes.withChartLock('two', async () => {
      release()
      await appendNodeSlowly('from-two', 'two', deps)
    })

    await Promise.all([first, second])
    expect(await nodeIdsOf('one', deps)).toEqual(['from-one'])
    expect(await nodeIdsOf('two', deps)).toEqual(['from-two'])
  })
})

describe('recordChange', () => {
  it('appends one entry with the injected clock and the named actor', async () => {
    const { deps } = fakeDeps()
    const writes: GanttWrites = createGanttWrites(deps)

    await recordChange(writes, 'plan', 'agent', 'created node "api"')
    await recordChange(writes, 'plan', 'sync', 'refreshed 3 mirrored nodes')

    expect(await readChartChangelog('plan', deps)).toEqual([
      { at: NOW, actor: 'agent', summary: 'created node "api"' },
      { at: NOW, actor: 'sync', summary: 'refreshed 3 mirrored nodes' },
    ])
  })
})

describe('deleteBodyFiles', () => {
  it('removes the body and its one level of undo', async () => {
    const body = bodyFilePath(HOME, 'plan', 'api')
    const prev = bodyPrevFilePath(HOME, 'plan', 'api')
    const { deps, files } = fakeDeps({ [body]: '# now', [prev]: '# before' })
    const writes = createGanttWrites(deps)

    await deleteBodyFiles(writes, 'plan', 'api')

    expect(files.has(body)).toBe(false)
    expect(files.has(prev)).toBe(false)
  })

  it('is a no-op for a node that never had a body', async () => {
    const { deps } = fakeDeps()
    const writes = createGanttWrites(deps)
    await expect(deleteBodyFiles(writes, 'plan', 'api')).resolves.toBeUndefined()
  })
})
