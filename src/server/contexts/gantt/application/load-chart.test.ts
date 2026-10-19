import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { bodyFilePath } from '../../../lib/gantt-store'
import { loadChart, loadChartList, loadKeyIndex, loadNodeBody } from './load-chart'
import {
  aChart,
  aNode,
  FAKE_HOME,
  fakeGanttStore,
  seedChart,
} from './__fixtures__/fake-gantt-store'

describe('loadChartList', () => {
  it.effect('summarises every chart on disk and reads the empty list when there are none', () =>
    Effect.gen(function* () {
      const { deps } = fakeGanttStore({
        ...seedChart(aChart({ id: 'plan', nodes: [aNode('a'), aNode('b', { column: 'Done' })] })),
        ...seedChart(aChart({ id: 'other', title: 'Other' })),
      })
      const charts = yield* loadChartList(deps)
      expect(charts.map((chart) => [chart.id, chart.nodeCount, chart.doneCount])).toEqual([
        ['other', 0, 0],
        ['plan', 2, 1],
      ])

      expect(yield* loadChartList(fakeGanttStore().deps)).toEqual([])
    }),
  )
})

describe('loadChart', () => {
  it.effect('derives hasBody from the files on disk rather than from a stored flag', () =>
    Effect.gen(function* () {
      const { deps } = fakeGanttStore({
        ...seedChart(aChart({ nodes: [aNode('api'), aNode('ui')] })),
        [bodyFilePath(FAKE_HOME, 'plan', 'api')]: '# the API',
      })
      const chart = yield* loadChart('plan', deps)
      expect(chart.nodes.map((node) => [node.id, node.hasBody])).toEqual([
        ['api', true],
        ['ui', false],
      ])
    }),
  )

  it.effect('fails with ChartNotFound for a chart that is not there', () =>
    Effect.gen(function* () {
      const failure = yield* loadChart('ghost', fakeGanttStore().deps).pipe(Effect.flip)
      expect(failure._tag).toBe('ChartNotFound')
    }),
  )
})

describe('loadNodeBody', () => {
  it.effect('reads the markdown, and null for a node that simply has none', () =>
    Effect.gen(function* () {
      const { deps } = fakeGanttStore({
        ...seedChart(aChart({ nodes: [aNode('api'), aNode('ui')] })),
        [bodyFilePath(FAKE_HOME, 'plan', 'api')]: '# the API',
      })
      expect(yield* loadNodeBody('plan', 'api', deps)).toEqual({
        chartId: 'plan',
        nodeId: 'api',
        markdown: '# the API',
      })
      expect((yield* loadNodeBody('plan', 'ui', deps)).markdown).toBeNull()
    }),
  )

  // "No body" and "no such node" must not look the same: a typo'd node id
  // reading as an empty PRD is silence an agent cannot correct.
  it.effect('fails with NodeNotFound for a node the chart does not have', () =>
    Effect.gen(function* () {
      const { deps } = fakeGanttStore(seedChart(aChart()))
      const failure = yield* loadNodeBody('plan', 'ghost', deps).pipe(Effect.flip)
      expect(failure._tag).toBe('NodeNotFound')
    }),
  )
})

// The palette's legality input for `g`: which tickets appear anywhere in the
// plan, and where. `show-in-gantt` is **absent** rather than disabled for a
// ticket that is not in the index, so what the index omits is as load-bearing as
// what it carries.
describe('loadKeyIndex', () => {
  it.effect('maps every mirrored Jira key across every chart to its lane', () =>
    Effect.gen(function* () {
      const { deps } = fakeGanttStore({
        ...seedChart(
          aChart({
            id: 'plan',
            nodes: [
              aNode('geo-141', { source: { kind: 'jira', key: 'GEO-141' } }),
              aNode('pricing-api'),
            ],
          }),
        ),
        ...seedChart(
          aChart({
            id: 'other',
            nodes: [aNode('geo-200', { source: { kind: 'jira', key: 'GEO-200' } })],
          }),
        ),
      })

      expect(yield* loadKeyIndex(deps)).toEqual({
        'GEO-141': { chartId: 'plan', nodeId: 'geo-141' },
        'GEO-200': { chartId: 'other', nodeId: 'geo-200' },
      })
    }),
  )

  // A local lane is a PRD the chart is the only copy of; it has no ticket, so
  // there is no key for `g` to be legal against.
  it.effect('leaves local lanes out entirely', () =>
    Effect.gen(function* () {
      const { deps } = fakeGanttStore(
        seedChart(aChart({ nodes: [aNode('tier-migration'), aNode('rate-cards')] })),
      )
      expect(yield* loadKeyIndex(deps)).toEqual({})
    }),
  )

  // Deterministic rather than arbitrary: `listChartIds` is sorted, so the first
  // chart by id wins. A key on two charts is a mistake in the plan, and the
  // answer to it should at least not change between reads.
  it.effect('resolves a key that is on two charts to the first chart by id', () =>
    Effect.gen(function* () {
      const node = { source: { kind: 'jira', key: 'GEO-141' } } as const
      const { deps } = fakeGanttStore({
        ...seedChart(aChart({ id: 'zeta', nodes: [aNode('on-zeta', node)] })),
        ...seedChart(aChart({ id: 'alpha', nodes: [aNode('on-alpha', node)] })),
      })
      expect(yield* loadKeyIndex(deps)).toEqual({
        'GEO-141': { chartId: 'alpha', nodeId: 'on-alpha' },
      })
    }),
  )

  it.effect('reads the empty index when there are no charts at all', () =>
    Effect.gen(function* () {
      expect(yield* loadKeyIndex(fakeGanttStore().deps)).toEqual({})
    }),
  )
})
