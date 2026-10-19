import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraTransportError, JiraUnauthorized } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { RawDetailedIssue, RawIssue, RawSearchResponse } from '../../../gateways/jira/types'
import { readChartChangelog } from '../../../lib/gantt-changelog-store'
import { chartFilePath } from '../../../lib/gantt-store'
import {
  aChart,
  aNode,
  FAKE_HOME,
  FAKE_NOW,
  fakeGanttStore,
  seedChart,
} from './__fixtures__/fake-gantt-store'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { bootstrapChart } from './bootstrap-chart'
import { GANTT_SYNC_FIELDS, syncChart } from './sync-chart'

// The sync use-case against a fake Jira and a fake disk. Everything about *what*
// a sync decides is `domain/reconcile.test.ts`; what is asserted here is the I/O
// contract — one search, one write, one changelog entry, and nothing at all on
// the disk when Jira does not answer.

const CHART_PATH = chartFilePath(FAKE_HOME, 'plan')

function anIssue(key: string, fields: Partial<RawIssue['fields']> = {}): RawIssue {
  return {
    id: key,
    key,
    fields: {
      summary: `Ticket ${key}`,
      status: { name: 'In Implementation' },
      assignee: { displayName: 'Ada Lovelace' },
      ...fields,
    },
  }
}

const found = (issues: readonly RawIssue[]): RawSearchResponse => ({ issues })

function withJira(jira: JiraGatewayShapeFake) {
  return <A, E>(program: Effect.Effect<A, E, JiraGateway>): Effect.Effect<A, E> =>
    program.pipe(Effect.provide(Layer.succeed(JiraGateway, jira)))
}
type JiraGatewayShapeFake = ReturnType<typeof fakeJiraGateway>

/** A chart with one mirrored node, one local lane, and one local arrow. */
const seeded = aChart({
  jiraSources: ['GEO-120'],
  nodes: [
    aNode('pricing-prd', { title: 'Pricing rework' }),
    aNode('geo-121', {
      source: { kind: 'jira', key: 'GEO-121' },
      parentId: 'pricing-prd',
      title: 'Stale title',
      start: '2026-02-01',
      end: '2026-02-14',
      status: 'Reviewed',
    }),
  ],
})

describe('syncChart', () => {
  it.effect('issues one search, over the fields the mirrored half and the links need', () =>
    Effect.gen(function* () {
      const calls: { jql: string; fields: readonly string[] }[] = []
      const jira = fakeJiraGateway({
        searchIssues: (jql, fields) => {
          calls.push({ jql, fields })
          return Effect.succeed(found([anIssue('GEO-121')]))
        },
      })
      const { writes } = fakeGanttStore(seedChart(seeded))
      yield* withJira(jira)(syncChart('plan', writes))
      expect(calls).toEqual([{ jql: 'parent in (GEO-120)', fields: GANTT_SYNC_FIELDS }])
    }),
  )

  it.effect(
    'refreshes the mirrored fields, stamps lastSyncedAt and keeps the chart-owned half',
    () =>
      Effect.gen(function* () {
        const jira = fakeJiraGateway({
          searchIssues: () =>
            Effect.succeed(found([anIssue('GEO-121', { summary: 'Fresh title' })])),
        })
        const { writes } = fakeGanttStore(seedChart(seeded))
        const chart = yield* withJira(jira)(syncChart('plan', writes))
        expect(chart.lastSyncedAt).toBe(FAKE_NOW)
        expect(chart.nodes.find((node) => node.id === 'geo-121')).toMatchObject({
          title: 'Fresh title',
          status: 'In Implementation',
          column: 'In Implementation',
          assignee: 'Ada Lovelace',
          parentId: 'pricing-prd',
          start: '2026-02-01',
          end: '2026-02-14',
        })
        expect(chart.nodes.find((node) => node.id === 'pricing-prd')).toEqual(seeded.nodes[0])
      }),
  )

  it.effect('writes exactly one changelog entry, as `sync`, naming the counts', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(found([anIssue('GEO-121'), anIssue('GEO-122')])),
      })
      const { writes, deps } = fakeGanttStore(seedChart(seeded))
      yield* withJira(jira)(syncChart('plan', writes))
      const entries = yield* Effect.promise(() => readChartChangelog('plan', deps))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ at: FAKE_NOW, actor: 'sync' })
      expect(entries[0]?.summary).toContain('1 updated · 1 added · 0 orphaned')
      expect(entries[0]?.summary).toContain('GEO-120')
    }),
  )

  // The epic still has children and GEO-121 is not among them — which is the
  // only shape that is actually evidence of a departure. An *empty* result is
  // not, and the two tests below are why.
  it.effect('marks a departed ticket and leaves it, with its children, on the chart', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(found([anIssue('GEO-122')])),
      })
      const { writes } = fakeGanttStore(seedChart(seeded))
      const chart = yield* withJira(jira)(syncChart('plan', writes))
      expect(chart.nodes.map((node) => node.id)).toEqual(['pricing-prd', 'geo-121', 'geo-122'])
      expect(chart.nodes[1]).toMatchObject({ orphaned: true, start: '2026-02-01' })
    }),
  )

  // ADR-0012 §5: sync never destroys. Orphaning argues from absence, and an
  // empty search against real sources is not absence — it is a mistyped epic
  // key, a renamed project, or a Jira that answered oddly, and all three look
  // exactly like "every child left at once".
  it.effect('orphans nothing when the discovery search came back empty', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({ searchIssues: () => Effect.succeed(found([])) })
      const { writes } = fakeGanttStore(seedChart(seeded))
      const chart = yield* withJira(jira)(syncChart('plan', writes))
      expect(chart.nodes[1]).toMatchObject({ id: 'geo-121', orphaned: false })
      // Still a sync: it ran, it asked, and it has a fresh stamp to show for it.
      expect(chart.lastSyncedAt).toBe(FAKE_NOW)
    }),
  )

  // The gateway caps a search at 100 and does not page, so a larger epic
  // discovers a prefix. What it *did* see is still applied — an addition argues
  // from presence — and only the orphan marks are dropped.
  it.effect('orphans nothing when the discovery search was truncated, but still adds', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({ issues: [anIssue('GEO-122')], nextPageToken: 'page-2' }),
      })
      const { writes } = fakeGanttStore(seedChart(seeded))
      const chart = yield* withJira(jira)(syncChart('plan', writes))
      expect(chart.nodes[1]).toMatchObject({ id: 'geo-121', orphaned: false })
      expect(chart.nodes.map((node) => node.id)).toContain('geo-122')
    }),
  )

  it.effect('fails with ChartNotFound before Jira is asked anything', () =>
    Effect.gen(function* () {
      let asked = false
      const jira = fakeJiraGateway({
        searchIssues: () => {
          asked = true
          return Effect.succeed(found([]))
        },
      })
      const { writes } = fakeGanttStore()
      const failure = yield* withJira(jira)(syncChart('plan', writes)).pipe(Effect.flip)
      expect(failure._tag).toBe('ChartNotFound')
      expect(asked).toBe(false)
    }),
  )

  it.each([
    ['a transport failure', new JiraTransportError({ message: 'socket hang up' })],
    ['an expired token', new JiraUnauthorized()],
  ])('reports %s as JiraUnreachable and leaves chart.json byte-identical', (_label, error) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const jira = fakeJiraGateway({ searchIssues: () => Effect.fail(error) })
        const { writes, files } = fakeGanttStore(seedChart(seeded))
        const before = files.get(CHART_PATH)
        const failure = yield* withJira(jira)(syncChart('plan', writes)).pipe(Effect.flip)
        expect(failure._tag).toBe('JiraUnreachable')
        expect(files.get(CHART_PATH)).toBe(before)
        // And no changelog file either: a sync that did not happen is not an
        // event in the plan's history.
        expect([...files.keys()]).toEqual([CHART_PATH])
      }),
    ),
  )

  it.effect('is a no-op reconciliation for a chart that names no epics', () =>
    Effect.gen(function* () {
      const local = aChart({ nodes: [aNode('geo-9', { source: { kind: 'jira', key: 'GEO-9' } })] })
      const { writes } = fakeGanttStore(seedChart(local))
      // No search at all — `searchIssues` would die if it were called — and in
      // particular the mirrored node is **not** orphaned by an empty discovery.
      const chart = yield* withJira(fakeJiraGateway({}))(syncChart('plan', writes))
      expect(chart.nodes[0]).toMatchObject({ id: 'geo-9', orphaned: false })
      expect(chart.lastSyncedAt).toBe(FAKE_NOW)
    }),
  )
})

// The cross-epic blocker: a jira node an agent created with `POST /nodes` for a
// ticket that lives in another epic, so no discovery search for this chart will
// ever return it. Mirroring it is a `getIssue`, not a search, and that read is
// what makes modelling it as the real ticket honest — the alternative an agent
// reached for was a local lane with a hand-copied status.
describe('syncChart — the lanes discovery cannot reach', () => {
  /** A chart whose second lane is a release gate in a different epic. */
  const withBlocker = aChart({
    jiraSources: ['HDR-20708'],
    nodes: [
      aNode('hdr-20709', { source: { kind: 'jira', key: 'HDR-20709' } }),
      aNode('hdr-19244', {
        source: { kind: 'jira', key: 'HDR-19244' },
        discovered: false,
        title: 'Groups API ships',
        status: 'In Implementation',
        column: 'In Implementation',
      }),
    ],
  })

  it.effect('survives a search that returns nothing, mirrored and not orphaned', () =>
    Effect.gen(function* () {
      const asked: string[] = []
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(found([])),
        getIssue: (key) => {
          asked.push(key)
          return Effect.succeed(
            anIssue('HDR-19244', { status: { name: 'In STG' } }) as RawDetailedIssue,
          )
        },
      })
      const { writes } = fakeGanttStore(seedChart(withBlocker))
      const chart = yield* withJira(jira)(syncChart('plan', writes))

      // Only the un-discovered key, and only because the search did not answer
      // for it: `hdr-20709` is already `discovered`, so it costs nothing.
      expect(asked).toEqual(['HDR-19244'])
      expect(chart.nodes[1]).toMatchObject({
        id: 'hdr-19244',
        status: 'In STG',
        orphaned: false,
        discovered: false,
      })
    }),
  )

  it.effect('asks for nothing once the search itself returns the key', () =>
    Effect.gen(function* () {
      let asked = 0
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(found([anIssue('HDR-19244')])),
        getIssue: () => {
          asked += 1
          return Effect.succeed(anIssue('HDR-19244') as RawDetailedIssue)
        },
      })
      const { writes } = fakeGanttStore(seedChart(withBlocker))
      const chart = yield* withJira(jira)(syncChart('plan', writes))
      expect(asked).toBe(0)
      // And the flag flips, so from now on it is an ordinary mirrored lane.
      expect(chart.nodes[1]).toMatchObject({ id: 'hdr-19244', discovered: true })
    }),
  )

  // One cross-epic lane whose mirrored half could not be read must not cost the
  // sync its write — the judgement `seed-dates.ts` makes per ticket.
  it.effect('skips a key Jira will not answer for rather than failing the sync', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(found([anIssue('HDR-20709')])),
        getIssue: () => Effect.fail(new JiraTransportError({ message: 'socket hang up' })),
      })
      const { writes } = fakeGanttStore(seedChart(withBlocker))
      const chart = yield* withJira(jira)(syncChart('plan', writes))
      expect(chart.lastSyncedAt).toBe(FAKE_NOW)
      expect(chart.nodes[1]).toMatchObject({
        id: 'hdr-19244',
        status: 'In Implementation',
        orphaned: false,
      })
    }),
  )
})

describe('bootstrapChart', () => {
  it.effect('creates the chart and fills it from one search', () =>
    Effect.gen(function* () {
      let searches = 0
      const jira = fakeJiraGateway({
        searchIssues: () => {
          searches += 1
          return Effect.succeed(
            found([
              anIssue('GEO-121', { parent: { key: 'GEO-120' } }),
              anIssue('GEO-122', { parent: { key: 'GEO-120' } }),
            ]),
          )
        },
      })
      const { writes } = fakeGanttStore()
      const chart = yield* withJira(jira)(
        bootstrapChart({ id: 'plan', title: 'The plan', jiraSources: ['GEO-120'] }, writes),
      )
      expect(searches).toBe(1)
      expect(chart.nodes).toHaveLength(2)
      expect(chart.nodes[0]).toMatchObject({
        id: 'geo-121',
        parentId: null,
        start: null,
        end: null,
        source: { kind: 'jira', key: 'GEO-121' },
      })
      expect(chart.lastSyncedAt).toBe(FAKE_NOW)
    }),
  )

  it.effect('never touches Jira for a chart with no sources', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore()
      const chart = yield* withJira(fakeJiraGateway({}))(
        bootstrapChart({ id: 'plan', title: 'The plan', jiraSources: [] }, writes),
      )
      expect(chart).toMatchObject({ nodes: [], lastSyncedAt: null })
    }),
  )

  it.effect('refuses a chart id that is already taken, without a Jira round-trip', () =>
    Effect.gen(function* () {
      const { writes } = fakeGanttStore(seedChart(seeded))
      const failure = yield* withJira(fakeJiraGateway({}))(
        bootstrapChart({ id: 'plan', title: 'Another plan', jiraSources: ['GEO-120'] }, writes),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe('DuplicateChartId')
    }),
  )
})
