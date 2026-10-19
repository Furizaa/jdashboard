import {
  GANTT_CHART_VERSION,
  type GanttChart,
  type GanttEdge,
  type GanttNode,
} from '../../../../lib/gantt-schema'
import { chartFilePath } from '../../../../lib/gantt-store'
import {
  createGanttWrites,
  type GanttWrites,
  type GanttWritesDeps,
} from '../../../../lib/gantt-writes'

// A fake filesystem over one map, plus the chart/node/edge builders the mutation
// tests seed it with. The same two-map shape `gantt-store.test.ts` uses — the
// application tests need a real store over a fake disk rather than a faked
// store, because the thing under test is the read-modify-write.

export const FAKE_HOME = '/home/me'
export const FAKE_NOW = '2026-10-19T09:00:00.000Z'

export type FakeGanttStore = {
  readonly writes: GanttWrites
  readonly deps: GanttWritesDeps
  readonly files: Map<string, string>
}

export function fakeGanttStore(seed?: Record<string, string>): FakeGanttStore {
  const files = new Map<string, string>(Object.entries(seed ?? {}))

  const deps: GanttWritesDeps = {
    homeDir: FAKE_HOME,
    readFile: (path) => {
      const value = files.get(path)
      return value === undefined ? Promise.reject(new Error('ENOENT')) : Promise.resolve(value)
    },
    writeFile: (path, data) => {
      files.set(path, data)
      return Promise.resolve()
    },
    mkdir: () => Promise.resolve(),
    readDir: (path) => {
      const prefix = `${path}/`
      const names = new Set<string>()
      for (const candidate of files.keys()) {
        if (!candidate.startsWith(prefix)) continue
        const rest = candidate.slice(prefix.length)
        names.add(rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : rest)
      }
      if (names.size === 0) return Promise.reject(new Error('ENOENT'))
      return Promise.resolve([...names])
    },
    rename: () => Promise.resolve(),
    deleteFile: (path) => {
      if (!files.has(path)) return Promise.reject(new Error('ENOENT'))
      files.delete(path)
      return Promise.resolve()
    },
    now: () => FAKE_NOW,
  }

  return { writes: createGanttWrites(deps), deps, files }
}

export function aChart(overrides: Partial<GanttChart> = {}): GanttChart {
  return {
    version: GANTT_CHART_VERSION,
    id: 'plan',
    title: 'The plan',
    jiraSources: [],
    lastSyncedAt: null,
    createdAt: FAKE_NOW,
    nodes: [],
    edges: [],
    ...overrides,
  }
}

export function aNode(id: string, overrides: Partial<GanttNode> = {}): GanttNode {
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
    orphaned: false,
    ...overrides,
  }
}

export function anEdge(id: string, from: string, to: string): GanttEdge {
  return { id, from, to, source: { kind: 'local' } }
}

/** Seed one chart on the fake disk, exactly as `writeChart` would have left it. */
export function seedChart(chart: GanttChart): Record<string, string> {
  return { [chartFilePath(FAKE_HOME, chart.id)]: `${JSON.stringify(chart, null, 2)}\n` }
}
