import { describe, expect, it } from '@effect/vitest'
import { Effect } from 'effect'
import { chartChangelogFilePath } from '../../../lib/gantt-changelog-store'
import { archiveDir, chartFilePath, listCharts } from '../../../lib/gantt-store'
import { archiveChartById } from './archive-chart'
import {
  aChart,
  aNode,
  FAKE_HOME,
  fakeGanttStore,
  seedChart,
} from './__fixtures__/fake-gantt-store'

// Archiving is the one irreversible verb on a system of record, and the whole
// reason there is no `DELETE /charts/:chartId` for an agent to reach
// (ADR-0012 §8). These assert the two properties that make "archive" an honest
// word for it: the plan moves rather than disappearing, and what is already in
// the archive is never overwritten.

const bodyPath = (chartId: string, nodeId: string) =>
  `${FAKE_HOME}/.clashboard/gantt/${chartId}/bodies/${nodeId}.md`

describe('archiveChartById', () => {
  it.effect('moves the chart, its bodies and its changelog under .archive/', () =>
    Effect.gen(function* () {
      const { writes, files } = fakeGanttStore({
        ...seedChart(aChart({ id: 'plan', nodes: [aNode('api')] })),
        [bodyPath('plan', 'api')]: '# the API',
        [chartChangelogFilePath(FAKE_HOME, 'plan')]: JSON.stringify([
          { at: '2026-10-01T00:00:00.000Z', actor: 'agent', summary: 'Created the chart.' },
        ]),
      })

      const { archivedTo } = yield* archiveChartById('plan', writes)

      expect(archivedTo).toBe(`${archiveDir(FAKE_HOME)}/plan`)
      // Gone from where it was…
      expect(files.has(chartFilePath(FAKE_HOME, 'plan'))).toBe(false)
      expect(files.has(bodyPath('plan', 'api'))).toBe(false)
      // …and present, whole, where it went. A body that did not travel with its
      // chart would be the irreplaceable half left behind.
      expect(files.has(`${archiveDir(FAKE_HOME)}/plan/chart.json`)).toBe(true)
      expect(files.get(`${archiveDir(FAKE_HOME)}/plan/bodies/api.md`)).toBe('# the API')
      expect(files.has(`${archiveDir(FAKE_HOME)}/plan/chart.changelog.json`)).toBe(true)
    }),
  )

  it.effect('leaves the chart list without it', () =>
    Effect.gen(function* () {
      const { writes, deps } = fakeGanttStore({
        ...seedChart(aChart({ id: 'plan' })),
        ...seedChart(aChart({ id: 'other', title: 'Other' })),
      })

      yield* archiveChartById('plan', writes)

      // `.archive` is not a slug, so it never survives the id filter — which is
      // why an archived chart leaves the list without a second rule saying so.
      expect((yield* Effect.promise(() => listCharts(deps))).map((c) => c.id)).toEqual(['other'])
    }),
  )

  it.effect('records the archive in the chart’s own changelog, before the move', () =>
    Effect.gen(function* () {
      const { writes, files } = fakeGanttStore(seedChart(aChart({ id: 'plan', title: 'The plan' })))

      yield* archiveChartById('plan', writes)

      // Read from the **archived** location, and nothing is left behind at the
      // live one: appending first is what puts the entry inside the folder that
      // then moved, rather than re-creating the folder the move just emptied.
      expect(files.has(chartChangelogFilePath(FAKE_HOME, 'plan'))).toBe(false)
      const raw = files.get(`${archiveDir(FAKE_HOME)}/plan/chart.changelog.json`)
      const entries = JSON.parse(raw ?? '[]') as readonly { actor: string; summary: string }[]
      expect(entries.map((entry) => entry.actor)).toEqual(['user'])
      expect(entries[0]?.summary).toContain('The plan')
    }),
  )

  it.effect('never overwrites an archive entry of the same id', () =>
    Effect.gen(function* () {
      const { writes, files } = fakeGanttStore({
        ...seedChart(aChart({ id: 'plan' })),
        [`${archiveDir(FAKE_HOME)}/plan/chart.json`]: '{"archived":"earlier"}',
      })

      const { archivedTo } = yield* archiveChartById('plan', writes)

      expect(archivedTo).not.toBe(`${archiveDir(FAKE_HOME)}/plan`)
      expect(archivedTo.startsWith(`${archiveDir(FAKE_HOME)}/plan-`)).toBe(true)
      // The earlier archive is untouched: overwriting it would be the second
      // half of the same mistake.
      expect(files.get(`${archiveDir(FAKE_HOME)}/plan/chart.json`)).toBe('{"archived":"earlier"}')
    }),
  )

  it.effect('fails with ChartNotFound rather than moving nothing quietly', () =>
    Effect.gen(function* () {
      const failure = yield* archiveChartById('ghost', fakeGanttStore().writes).pipe(Effect.flip)
      expect(failure._tag).toBe('ChartNotFound')
    }),
  )
})
