import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { readChartChangelog } from '../../../lib/gantt-changelog-store'
import { bodyFilePath, bodyPrevFilePath, readBody, readChart } from '../../../lib/gantt-store'
import {
  createChart,
  createEdge,
  createNode,
  deleteEdge,
  deleteNode,
  patchChart,
  patchNode,
  putBody,
} from './mutate-chart'
import {
  aChart,
  anEdge,
  aNode,
  FAKE_HOME,
  FAKE_NOW,
  fakeGanttStore,
  seedChart,
} from './__fixtures__/fake-gantt-store'

// The write use-cases over a real store on a fake disk. Faking the store instead
// would test the orchestration and not the thing that matters — that the chart
// which comes back off disk is the one the mutation meant to leave there.

const NODE_BODY = {
  id: 'api',
  parentId: null,
  order: 0,
  title: 'API',
  source: { kind: 'local' as const },
  start: null,
  end: null,
  column: 'TO DO' as const,
  status: null,
  assignee: null,
}

describe('createChart', () => {
  it('writes a new chart with the server-owned fields filled in', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore()
      const chart = yield* createChart(
        { id: 'plan', title: 'The plan', jiraSources: ['GEO-1'] },
        writes,
      )

      expect(chart).toEqual({
        version: 1,
        id: 'plan',
        title: 'The plan',
        jiraSources: ['GEO-1'],
        lastSyncedAt: null,
        createdAt: FAKE_NOW,
        nodes: [],
        edges: [],
      })
      expect(yield* Effect.promise(() => readChart('plan', deps))).toEqual(chart)
    }))

  it('appends exactly one changelog entry, naming the actor', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore()
      yield* createChart({ id: 'plan', title: 'The plan', jiraSources: [] }, writes)

      const log = yield* Effect.promise(() => readChartChangelog('plan', deps))
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({ at: FAKE_NOW, actor: 'agent' })
      expect(log[0]?.summary).toContain('created chart "plan"')
    }))

  it('refuses a chart id that is already taken', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart()))
      const failure = yield* createChart(
        { id: 'plan', title: 'Again', jiraSources: [] },
        writes,
      ).pipe(Effect.flip)
      expect(failure._tag).toBe('DuplicateChartId')
    }))
})

describe('patchChart', () => {
  it('patches the title and jiraSources and nothing else', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart({ nodes: [aNode('api')] })))
      const patched = yield* patchChart('plan', { title: 'Renamed' }, writes)
      expect(patched.title).toBe('Renamed')
      expect(patched.createdAt).toBe(FAKE_NOW)
      expect(patched.nodes.map((node) => node.id)).toEqual(['api'])
    }))

  it('is a 404 for a chart that is not there', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore()
      const failure = yield* patchChart('ghost', { title: 'x' }, writes).pipe(Effect.flip)
      expect(failure._tag).toBe('ChartNotFound')
    }))
})

describe('createNode', () => {
  it('appends the node with orphaned false — a fact sync observes, not a claim', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore(seedChart(aChart()))
      const node = yield* createNode('plan', NODE_BODY, writes)
      expect(node.orphaned).toBe(false)
      const stored = yield* Effect.promise(() => readChart('plan', deps))
      expect(stored?.nodes.map((n) => n.id)).toEqual(['api'])
    }))

  it('refuses a duplicate node id', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart({ nodes: [aNode('api')] })))
      const failure = yield* createNode('plan', NODE_BODY, writes).pipe(Effect.flip)
      expect(failure._tag).toBe('DuplicateNodeId')
    }))

  it('refuses a parentId naming a node that does not exist', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart()))
      const failure = yield* createNode('plan', { ...NODE_BODY, parentId: 'ghost' }, writes).pipe(
        Effect.flip,
      )
      expect(failure._tag).toBe('NodeNotFound')
    }))
})

describe('patchNode', () => {
  const jiraChart = aChart({
    nodes: [aNode('geo-120', { source: { kind: 'jira', key: 'GEO-120' }, title: 'Mirrored' })],
  })

  it('refuses a mirrored field on a jira-sourced node, naming the fields', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(jiraChart))
      const failure = yield* patchNode('plan', 'geo-120', { title: 'Mine now' }, writes).pipe(
        Effect.flip,
      )
      expect(failure._tag).toBe('MirroredFieldPatch')
      expect(failure).toMatchObject({ nodeId: 'geo-120', fields: ['title'] })
    }))

  it('accepts a chart-owned field on the same node', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(jiraChart))
      const patched = yield* patchNode('plan', 'geo-120', { start: '2026-11-02' }, writes)
      expect(patched.start).toBe('2026-11-02')
      expect(patched.title).toBe('Mirrored')
    }))

  it('accepts a mirrored field on a local node — nothing will overwrite it', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart({ nodes: [aNode('api')] })))
      const patched = yield* patchNode('plan', 'api', { title: 'Renamed' }, writes)
      expect(patched.title).toBe('Renamed')
    }))

  it('is a 404 for an unknown node and for an unknown new parent', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart({ nodes: [aNode('api')] })))
      expect((yield* patchNode('plan', 'ghost', {}, writes).pipe(Effect.flip))._tag).toBe(
        'NodeNotFound',
      )
      expect(
        (yield* patchNode('plan', 'api', { parentId: 'ghost' }, writes).pipe(Effect.flip))._tag,
      ).toBe('NodeNotFound')
    }))
})

describe('deleteNode', () => {
  const tree = aChart({
    nodes: [
      aNode('prd'),
      aNode('feature', { parentId: 'prd' }),
      aNode('task-a', { parentId: 'feature' }),
      aNode('task-b', { parentId: 'feature' }),
      aNode('other'),
    ],
    edges: [anEdge('e1', 'feature', 'other'), anEdge('e2', 'other', 'task-a')],
  })

  it('reparents the children to the deleted node’s parent and removes its edges', () =>
    Effect.gen(function* () {
      const body = bodyFilePath(FAKE_HOME, 'plan', 'feature')
      const prev = bodyPrevFilePath(FAKE_HOME, 'plan', 'feature')
      const { writes, deps, files } = fakeGanttStore({
        ...seedChart(tree),
        [body]: '# the feature',
        [prev]: '# the feature, before',
      })

      const result = yield* deleteNode('plan', 'feature', writes)

      expect(result).toEqual({
        chartId: 'plan',
        nodeId: 'feature',
        reparentedTo: 'prd',
        reparentedChildIds: ['task-a', 'task-b'],
        removedEdgeIds: ['e1'],
      })
      const stored = yield* Effect.promise(() => readChart('plan', deps))
      expect(stored?.nodes.map((n) => [n.id, n.parentId])).toEqual([
        ['prd', null],
        ['task-a', 'prd'],
        ['task-b', 'prd'],
        ['other', null],
      ])
      expect(stored?.edges.map((e) => e.id)).toEqual(['e2'])
      expect(files.has(body)).toBe(false)
      expect(files.has(prev)).toBe(false)
    }))

  it('reparents a root node’s children to the root', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore(seedChart(tree))
      yield* deleteNode('plan', 'prd', writes)
      const stored = yield* Effect.promise(() => readChart('plan', deps))
      expect(stored?.nodes.find((n) => n.id === 'feature')?.parentId).toBeNull()
    }))

  it('is a 404 for a node that is not there', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(tree))
      const failure = yield* deleteNode('plan', 'ghost', writes).pipe(Effect.flip)
      expect(failure._tag).toBe('NodeNotFound')
    }))
})

describe('putBody', () => {
  it('writes the markdown and snapshots the predecessor to .md.prev', () =>
    Effect.gen(function* () {
      const { writes, deps, files } = fakeGanttStore(seedChart(aChart({ nodes: [aNode('api')] })))

      const first = yield* putBody('plan', 'api', '# first', writes)
      expect(first.snapshotted).toBe(false)
      expect(files.has(bodyPrevFilePath(FAKE_HOME, 'plan', 'api'))).toBe(false)

      const second = yield* putBody('plan', 'api', '# second', writes)
      expect(second.snapshotted).toBe(true)
      expect(yield* Effect.promise(() => readBody('plan', 'api', deps))).toBe('# second')
      expect(files.get(bodyPrevFilePath(FAKE_HOME, 'plan', 'api'))).toBe('# first')
      expect(yield* Effect.promise(() => readChartChangelog('plan', deps))).toHaveLength(2)
    }))

  it('is a 404 for a node the chart does not have', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart()))
      const failure = yield* putBody('plan', 'ghost', '# x', writes).pipe(Effect.flip)
      expect(failure._tag).toBe('NodeNotFound')
    }))
})

describe('createEdge', () => {
  const two = aChart({ nodes: [aNode('a'), aNode('b')] })

  it('records an edge that closes a cycle — the API never refuses a declared dependency', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore(
        seedChart(aChart({ nodes: two.nodes, edges: [anEdge('ab', 'a', 'b')] })),
      )
      const edge = yield* createEdge(
        'plan',
        { id: 'ba', from: 'b', to: 'a', source: { kind: 'local' } },
        writes,
      )
      expect(edge.id).toBe('ba')
      const stored = yield* Effect.promise(() => readChart('plan', deps))
      expect(stored?.edges.map((e) => e.id)).toEqual(['ab', 'ba'])
    }))

  it('refuses an edge naming a node that does not exist', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(two))
      const failure = yield* createEdge(
        'plan',
        { id: 'ax', from: 'a', to: 'ghost', source: { kind: 'local' } },
        writes,
      ).pipe(Effect.flip)
      expect(failure._tag).toBe('NodeNotFound')
    }))

  it('refuses a duplicate edge id — an id is a handle, and DELETE needs it unambiguous', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(
        seedChart(aChart({ nodes: two.nodes, edges: [anEdge('ab', 'a', 'b')] })),
      )
      const failure = yield* createEdge(
        'plan',
        { id: 'ab', from: 'b', to: 'a', source: { kind: 'local' } },
        writes,
      ).pipe(Effect.flip)
      expect(failure._tag).toBe('DuplicateEdgeId')
    }))
})

describe('deleteEdge', () => {
  it('removes the edge and leaves both its nodes alone', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore(
        seedChart(aChart({ nodes: [aNode('a'), aNode('b')], edges: [anEdge('ab', 'a', 'b')] })),
      )
      const edge = yield* deleteEdge('plan', 'ab', writes)
      expect(edge.id).toBe('ab')
      const stored = yield* Effect.promise(() => readChart('plan', deps))
      expect(stored?.edges).toEqual([])
      expect(stored?.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    }))

  it('is a 404 for an edge id the chart does not have', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(aChart()))
      const failure = yield* deleteEdge('plan', 'ghost', writes).pipe(Effect.flip)
      expect(failure._tag).toBe('EdgeNotFound')
    }))
})

describe('every mutation', () => {
  // The audit trail is the third of the three things ADR-0012 §1's exception is
  // paid for with, so "one entry per write" is asserted over the whole surface
  // rather than per use-case.
  it('appends exactly one changelog entry', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore()
      yield* createChart({ id: 'plan', title: 'The plan', jiraSources: [] }, writes)
      yield* patchChart('plan', { title: 'Renamed' }, writes)
      yield* createNode('plan', NODE_BODY, writes)
      yield* createNode('plan', { ...NODE_BODY, id: 'ui' }, writes)
      yield* patchNode('plan', 'ui', { start: '2026-11-02' }, writes)
      yield* putBody('plan', 'ui', '# ui', writes)
      yield* createEdge(
        'plan',
        { id: 'ab', from: 'api', to: 'ui', source: { kind: 'local' } },
        writes,
      )
      yield* deleteEdge('plan', 'ab', writes)
      yield* deleteNode('plan', 'ui', writes)

      const log = yield* Effect.promise(() => readChartChangelog('plan', deps))
      expect(log).toHaveLength(9)
      expect(log.every((entry) => entry.actor === 'agent')).toBe(true)
    }))
})
