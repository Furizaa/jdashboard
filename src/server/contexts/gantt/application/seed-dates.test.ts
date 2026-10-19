import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer } from 'effect'
import { JiraNotFound, JiraTransportError } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { StatusTransition } from '../../../gateways/jira/types'
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
import { SEED_DATES_CONCURRENCY, seedDatesFromHistory } from './seed-dates'

// The date-seeding use-case against a fake Jira and a fake disk. *What* a span
// is belongs to `domain/history-dates.test.ts`; what is asserted here is the I/O
// contract — one changelog request per distinct key, bounded, the fill-only-nulls
// rule over a chart that has moved on, one skipped ticket costing only itself,
// and nothing at all on disk when Jira answers for nothing.
//
// Every Effect body is `it.effect`, never a plain `it`: a plain `it` hands
// vitest an un-run Effect and every assertion inside it passes silently. The two
// `watchlist/application/*.test.ts` files still have that bug; this file follows
// `review/application/load-review-cards.test.ts` instead.

const CHART_PATH = chartFilePath(FAKE_HOME, 'plan')

const at = (date: string, to: string): StatusTransition => ({
  at: `${date}T10:00:00.000+0200`,
  from: null,
  to,
})

/** Started in September, in UAT since — Done by column, so a closed span. */
const FINISHED = [at('2026-09-01', 'IN IMPLEMENTATION'), at('2026-09-09', 'IN UAT')]
/** Started and still running. */
const RUNNING = [at('2026-09-02', 'IN IMPLEMENTATION'), at('2026-09-07', 'IN CODE REVIEW')]
/** Never left TO DO, which is what the five genuinely-future lanes look like. */
const UNSTARTED = [at('2026-09-01', 'New')]

function withJira(jira: ReturnType<typeof fakeJiraGateway>) {
  return <A, E>(program: Effect.Effect<A, E, JiraGateway>): Effect.Effect<A, E> =>
    program.pipe(Effect.provide(Layer.succeed(JiraGateway, jira)))
}

/** A gateway answering from a table of histories, recording what it was asked. */
function changelogGateway(
  histories: Record<string, readonly StatusTransition[]>,
  asked: string[] = [],
) {
  return fakeJiraGateway({
    getIssueChangelog: (key) => {
      asked.push(key)
      const history = histories[key]
      return history === undefined ? Effect.fail(new JiraNotFound()) : Effect.succeed([...history])
    },
  })
}

/** Three mirrored lanes and one local one, none of them dated. */
const seeded = aChart({
  jiraSources: ['HDR-20708'],
  nodes: [
    aNode('user-groups-prd', { title: 'User groups' }),
    aNode('hdr-1', { source: { kind: 'jira', key: 'HDR-1' }, status: 'IN UAT' }),
    aNode('hdr-2', { source: { kind: 'jira', key: 'HDR-2' }, status: 'IN CODE REVIEW' }),
    aNode('hdr-3', { source: { kind: 'jira', key: 'HDR-3' }, status: 'New' }),
  ],
})

describe('seedDatesFromHistory', () => {
  it.effect(
    'dates the finished lane, leaves the running one open-ended, and skips the local one',
    () =>
      Effect.gen(function* () {
        const asked: string[] = []
        const jira = changelogGateway(
          { 'HDR-1': FINISHED, 'HDR-2': RUNNING, 'HDR-3': UNSTARTED },
          asked,
        )
        const { writes } = fakeGanttStore(seedChart(seeded))
        const chart = yield* withJira(jira)(seedDatesFromHistory('plan', writes))

        expect(asked.toSorted()).toEqual(['HDR-1', 'HDR-2', 'HDR-3'])
        expect(chart.nodes.find((node) => node.id === 'hdr-1')).toMatchObject({
          start: '2026-09-01',
          end: '2026-09-09',
        })
        // In flight: a start, and **no end**. Not today's date — a forecast is the
        // agent's job and the view draws an open-ended bar.
        expect(chart.nodes.find((node) => node.id === 'hdr-2')).toMatchObject({
          start: '2026-09-02',
          end: null,
        })
        expect(chart.nodes.find((node) => node.id === 'hdr-3')).toMatchObject({
          start: null,
          end: null,
        })
        // The local lane is the agent's to date; it has no Jira to ask.
        expect(chart.nodes[0]).toEqual(seeded.nodes[0])
      }),
  )

  // The rule the whole verb rests on (ADR-0012 §3): dates are chart-owned, and
  // this fills blanks rather than correcting them. Without it, every run would
  // undo whatever the agent decided since the last one.
  it.effect('fills only nulls — a hand-set start survives a history that disagrees', () =>
    Effect.gen(function* () {
      const byHand = aChart({
        nodes: [
          aNode('hdr-1', {
            source: { kind: 'jira', key: 'HDR-1' },
            start: '2026-01-15',
            end: null,
          }),
        ],
      })
      const { writes } = fakeGanttStore(seedChart(byHand))
      const chart = yield* withJira(changelogGateway({ 'HDR-1': FINISHED }))(
        seedDatesFromHistory('plan', writes),
      )
      // The hand-set start stands; only the blank end is filled.
      expect(chart.nodes[0]).toMatchObject({ start: '2026-01-15', end: '2026-09-09' })
    }),
  )

  it.effect('leaves a fully dated node alone, and does not ask Jira about it at all', () =>
    Effect.gen(function* () {
      const done = aChart({
        nodes: [
          aNode('hdr-1', {
            source: { kind: 'jira', key: 'HDR-1' },
            start: '2026-01-15',
            end: '2026-02-20',
          }),
        ],
      })
      const asked: string[] = []
      const { writes } = fakeGanttStore(seedChart(done))
      const chart = yield* withJira(changelogGateway({ 'HDR-1': FINISHED }, asked))(
        seedDatesFromHistory('plan', writes),
      )
      expect(asked).toEqual([])
      expect(chart.nodes[0]).toEqual(done.nodes[0])
    }),
  )

  // One unreachable ticket must not cost the others their dates.
  it.effect('skips a ticket Jira cannot answer for and still dates and writes the rest', () =>
    Effect.gen(function* () {
      const jira = fakeJiraGateway({
        getIssueChangelog: (key) =>
          key === 'HDR-2'
            ? Effect.fail(new JiraTransportError({ message: 'socket hang up' }))
            : Effect.succeed([...FINISHED]),
      })
      const { writes, deps } = fakeGanttStore(seedChart(seeded))
      const chart = yield* withJira(jira)(seedDatesFromHistory('plan', writes))

      expect(chart.nodes.find((node) => node.id === 'hdr-1')).toMatchObject({
        start: '2026-09-01',
        end: '2026-09-09',
      })
      expect(chart.nodes.find((node) => node.id === 'hdr-2')).toMatchObject({
        start: null,
        end: null,
      })
      const entries = yield* Effect.promise(() => readChartChangelog('plan', deps))
      expect(entries[0]?.summary).toContain('1 Jira could not answer')
    }),
  )

  it.effect('writes exactly one changelog entry, as `sync`, naming the counts', () =>
    Effect.gen(function* () {
      const jira = changelogGateway({ 'HDR-1': FINISHED, 'HDR-2': RUNNING, 'HDR-3': UNSTARTED })
      const { writes, deps } = fakeGanttStore(seedChart(seeded))
      yield* withJira(jira)(seedDatesFromHistory('plan', writes))
      const entries = yield* Effect.promise(() => readChartChangelog('plan', deps))
      expect(entries).toHaveLength(1)
      expect(entries[0]).toMatchObject({ at: FAKE_NOW, actor: 'sync' })
      expect(entries[0]?.summary).toBe(
        'dated 2 lanes · 1 had no history · 1 still in flight · 0 Jira could not answer',
      )
    }),
  )

  // The verb is re-run by hand, so a second run has to be both a no-op on the
  // chart and legible in the audit trail: nothing newly dated, and the lane that
  // is still running still reported as running rather than as having no history.
  it.effect('is a no-op on a second run, and says so', () =>
    Effect.gen(function* () {
      const jira = changelogGateway({ 'HDR-1': FINISHED, 'HDR-2': RUNNING, 'HDR-3': UNSTARTED })
      const { writes, deps, files } = fakeGanttStore(seedChart(seeded))
      yield* withJira(jira)(seedDatesFromHistory('plan', writes))
      const afterFirst = files.get(CHART_PATH)
      yield* withJira(jira)(seedDatesFromHistory('plan', writes))

      expect(files.get(CHART_PATH)).toBe(afterFirst)
      const entries = yield* Effect.promise(() => readChartChangelog('plan', deps))
      expect(entries).toHaveLength(2)
      expect(entries[1]?.summary).toBe(
        'dated 0 lanes · 1 had no history · 1 still in flight · 0 Jira could not answer',
      )
    }),
  )

  // Twenty-four sequential round-trips is a visible stall; twenty-four parallel
  // ones is rude to an instance the whole team shares.
  it.effect('asks Jira with bounded concurrency', () =>
    Effect.gen(function* () {
      let inFlight = 0
      let peak = 0
      const jira = fakeJiraGateway({
        getIssueChangelog: () =>
          Effect.gen(function* () {
            inFlight += 1
            peak = Math.max(peak, inFlight)
            yield* Effect.yieldNow()
            inFlight -= 1
            return [...FINISHED]
          }),
      })
      const many = aChart({
        nodes: Array.from({ length: 24 }, (_unused, index) =>
          aNode(`hdr-${index}`, { source: { kind: 'jira', key: `HDR-${index}` } }),
        ),
      })
      const { writes } = fakeGanttStore(seedChart(many))
      const chart = yield* withJira(jira)(seedDatesFromHistory('plan', writes))

      expect(peak).toBeGreaterThan(1)
      expect(peak).toBeLessThanOrEqual(SEED_DATES_CONCURRENCY)
      expect(chart.nodes.every((node) => node.start === '2026-09-01')).toBe(true)
    }),
  )

  it.effect('fails with ChartNotFound before Jira is asked anything', () =>
    Effect.gen(function* () {
      const asked: string[] = []
      const { writes } = fakeGanttStore()
      const failure = yield* withJira(changelogGateway({}, asked))(
        seedDatesFromHistory('plan', writes),
      ).pipe(Effect.flip)
      expect(failure._tag).toBe('ChartNotFound')
      expect(asked).toEqual([])
    }),
  )

  // A whole chart Jira will not speak about is Jira being down, not twenty-four
  // separate facts about twenty-four tickets — and the chart is left alone.
  it.effect(
    'reports JiraUnreachable when Jira answered for nothing, leaving chart.json alone',
    () =>
      Effect.gen(function* () {
        const jira = fakeJiraGateway({
          getIssueChangelog: () => Effect.fail(new JiraTransportError({ message: 'ECONNREFUSED' })),
        })
        const { writes, files } = fakeGanttStore(seedChart(seeded))
        const before = files.get(CHART_PATH)
        const failure = yield* withJira(jira)(seedDatesFromHistory('plan', writes)).pipe(
          Effect.flip,
        )
        expect(failure._tag).toBe('JiraUnreachable')
        expect(files.get(CHART_PATH)).toBe(before)
        // And no changelog either: a run that filled nothing is not an event.
        expect([...files.keys()]).toEqual([CHART_PATH])
      }),
  )

  it.effect('never touches Jira for a chart whose lanes are all local', () =>
    Effect.gen(function* () {
      const local = aChart({ nodes: [aNode('prd', { title: 'A PRD' })] })
      const { writes } = fakeGanttStore(seedChart(local))
      const chart = yield* withJira(fakeJiraGateway({}))(seedDatesFromHistory('plan', writes))
      expect(chart.nodes).toEqual(local.nodes)
    }),
  )

  it.effect('asks once for a key two lanes mirror', () =>
    Effect.gen(function* () {
      const twice = aChart({
        nodes: [
          aNode('hdr-1', { source: { kind: 'jira', key: 'HDR-1' } }),
          aNode('hdr-1-ui', { source: { kind: 'jira', key: 'HDR-1' } }),
        ],
      })
      const asked: string[] = []
      const { writes } = fakeGanttStore(seedChart(twice))
      const chart = yield* withJira(changelogGateway({ 'HDR-1': FINISHED }, asked))(
        seedDatesFromHistory('plan', writes),
      )
      expect(asked).toEqual(['HDR-1'])
      expect(chart.nodes.every((node) => node.start === '2026-09-01')).toBe(true)
    }),
  )
})
