import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { bodyFilePath } from '../../../lib/gantt-store'
import { loadChart, loadChartList, loadNodeBody } from './load-chart'
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
