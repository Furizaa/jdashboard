import { Effect } from 'effect'
import { JiraGateway } from '../../../gateways/jira/port'
import {
  ganttChartSchema,
  toIssues,
  type GanttChart,
  type GanttNode,
} from '../../../lib/gantt-schema'
import { readChart, writeChart } from '../../../lib/gantt-store'
import { recordChange, type GanttWrites } from '../../../lib/gantt-writes'
import { spanFromHistory, type HistorySpan } from '../domain/history-dates'
import { ChartNotFound, InvalidChartPayload, JiraUnreachable } from '../errors'

// `POST /charts/:chartId/dates` — the verb that fills a chart's **blank** dates
// from the one truthful source there is for work that has already happened.
//
// Shaped exactly like `sync-chart.ts`, and for the same reasons: read the chart,
// talk to Jira, then one `withChartLock` that re-reads the chart, computes,
// writes, and appends one changelog entry. Nothing is opened for writing until
// Jira has answered.
//
// What is different is the rule in the middle, and it is the whole point of the
// verb: **it fills only nulls.** Dates are chart-owned (ADR-0012 §3) — history
// is not a second writer of them, it is a source of a first guess where there is
// nothing at all. A node whose `start` an agent set keeps it even if history
// disagrees, which is what makes this safe to re-run and what stops it fighting
// the agent that is planning the same chart.
//
// clashboard has to be the one to do this. The agent cannot: clashboard holds
// the Jira credentials and `acli jira workitem view --json` returns no
// transitions at all.

/**
 * How many changelogs are in flight at once.
 *
 * Twenty-four sequential round-trips is a visible stall on a surface whose whole
 * promise is "where is this programme of work"; twenty-four parallel ones is
 * rude to an instance the whole team shares. Five is the shape `Effect.forEach`
 * makes cheap and the number this chart made concrete.
 */
export const SEED_DATES_CONCURRENCY = 5

/** What one run did, as the changelog entry reports it. */
export type SeedDatesCounts = {
  /** Lanes that gained a `start`, an `end`, or both. */
  readonly dated: number
  /** Lanes whose history shows they never left TO DO, so there is nothing to fill. */
  readonly withoutHistory: number
  /** Lanes whose history shows a start and no finish. They keep `end: null`. */
  readonly inFlight: number
  /** Tickets Jira would not answer for. Skipped, never fatal. */
  readonly unanswered: number
}

export type SeedDatesError = ChartNotFound | JiraUnreachable | InvalidChartPayload

/** `null` means Jira did not answer for this key — which is not the same as an empty history. */
type SpansByKey = ReadonlyMap<string, HistorySpan | null>

/** A node this verb has anything to say about: mirrored, and missing a date. */
function wantsDates(
  node: GanttNode,
): node is GanttNode & { source: { kind: 'jira'; key: string } } {
  return node.source.kind === 'jira' && (node.start === null || node.end === null)
}

/**
 * The distinct Jira keys worth asking about. Distinct because a key is the unit
 * of the request while a node is the unit of the chart: two lanes mirroring one
 * ticket is legal, and asking twice for the same history would be a round-trip
 * spent on an answer already in hand.
 */
function keysToAsk(chart: GanttChart): readonly string[] {
  const keys = new Set<string>()
  for (const node of chart.nodes) {
    if (wantsDates(node)) keys.add(node.source.key)
  }
  return [...keys]
}

/**
 * One changelog per key, five at a time, and **a failure per key rather than for
 * the run**: one unreachable ticket must not cost the other twenty-three their
 * dates. A `null` span is the record of that, counted and reported.
 *
 * The run as a whole fails only when Jira answered for *nothing* — which is the
 * only evidence available here that the problem is Jira rather than one ticket,
 * and it is what the route's `503` means.
 */
function gatherSpans(
  chartId: string,
  keys: readonly string[],
): Effect.Effect<SpansByKey, JiraUnreachable, JiraGateway> {
  if (keys.length === 0) return Effect.succeed(new Map())
  return Effect.gen(function* () {
    const jira = yield* JiraGateway
    const entries = yield* Effect.forEach(
      keys,
      (key) =>
        jira.getIssueChangelog(key).pipe(
          Effect.map((transitions): readonly [string, HistorySpan | null] => [
            key,
            spanFromHistory(transitions),
          ]),
          Effect.catchAll(() => Effect.succeed([key, null] as const)),
        ),
      { concurrency: SEED_DATES_CONCURRENCY },
    )
    if (entries.every(([, span]) => span === null)) {
      return yield* Effect.fail(
        new JiraUnreachable({
          chartId,
          message: `Jira answered for none of the ${keys.length} tickets on this chart`,
        }),
      )
    }
    return new Map(entries)
  })
}

/** A node with its blanks filled, or the node itself when history had nothing to add. */
function fill(node: GanttNode, span: HistorySpan): GanttNode {
  const start = node.start ?? span.start
  const end = node.end ?? span.end
  if (start === node.start && end === node.end) return node
  return { ...node, start, end }
}

type Seeded = { readonly nodes: readonly GanttNode[]; readonly counts: SeedDatesCounts }

/**
 * Apply the spans to the chart as it is **now**, inside the lock.
 *
 * `node.start ?? span.start` is the fill-only-nulls rule, and writing it as a
 * coalesce rather than a branch is deliberate: there is no code path here that
 * can overwrite a date, so the guarantee is structural rather than tested into
 * place.
 */
function seedNodes(chart: GanttChart, spans: SpansByKey): Seeded {
  let dated = 0
  let withoutHistory = 0
  let inFlight = 0
  let unanswered = 0
  const nodes = chart.nodes.map((node) => {
    if (!wantsDates(node)) return node
    const span = spans.get(node.source.key)
    if (span === undefined) return node
    if (span === null) {
      unanswered += 1
      return node
    }
    const next = fill(node, span)
    // The three counts are about the *history*, not about what changed, so that
    // a second run of the verb reports the same chart the same way: it has
    // nothing left to fill, and the four lanes that are still running are still
    // running. Only `dated` is about the write.
    if (next !== node) dated += 1
    if (span.start === null) withoutHistory += 1
    else if (next.end === null) inFlight += 1
    return next
  })
  return { nodes, counts: { dated, withoutHistory, inFlight, unanswered } }
}

/** `dated 24 lanes · 5 had no history · 3 still in flight · 0 Jira could not answer`. */
function summarize(counts: SeedDatesCounts): string {
  return (
    `dated ${counts.dated} lanes · ${counts.withoutHistory} had no history · ` +
    `${counts.inFlight} still in flight · ${counts.unanswered} Jira could not answer`
  )
}

type Outcome =
  | { readonly ok: true; readonly chart: GanttChart }
  | { readonly ok: false; readonly error: ChartNotFound | InvalidChartPayload }

/**
 * The one write, inside the one lock — `sync-chart.ts`'s `writeSynced` in every
 * respect, including the schema check before the write: `readChart` treats an
 * invalid `chart.json` as **absent**, so a write the schema would reject must
 * not land. It would not corrupt the plan, it would make it disappear.
 *
 * The chart is read **again** here rather than carried in from the gather step.
 * Twenty-four Jira round-trips is long enough for an agent to have written a
 * node, or a date, into the same chart, and the re-read is what makes
 * fill-only-nulls true about the chart as it is rather than as it was.
 */
function writeSeeded(
  writes: GanttWrites,
  chartId: string,
  spans: SpansByKey,
): Effect.Effect<GanttChart, ChartNotFound | InvalidChartPayload> {
  return Effect.promise<Outcome>(() =>
    writes.withChartLock(chartId, async (): Promise<Outcome> => {
      const chart = await readChart(chartId, writes.deps)
      if (chart === null) return { ok: false, error: new ChartNotFound({ chartId }) }
      const { nodes, counts } = seedNodes(chart, spans)
      const parsed = ganttChartSchema.safeParse({ ...chart, nodes }, { reportInput: true })
      if (!parsed.success) {
        return {
          ok: false,
          error: new InvalidChartPayload({
            message: 'seeding the dates would have left the chart invalid, so nothing was written',
            issues: toIssues(parsed.error),
          }),
        }
      }
      await writeChart(parsed.data, writes.deps)
      // Exactly one entry per run, inside the same critical section as the write
      // it describes (ADR-0012 §11), and `sync` rather than `agent`: this is
      // clashboard reading Jira on the plan's behalf, which is the same actor
      // that refreshes the mirrored half.
      await recordChange(writes, chartId, 'sync', summarize(counts))
      return { ok: true, chart: parsed.data }
    }),
  ).pipe(
    Effect.flatMap((outcome) =>
      outcome.ok ? Effect.succeed(outcome.chart) : Effect.fail(outcome.error),
    ),
  )
}

/**
 * Fill the blank dates on one chart from its tickets' status histories.
 *
 * `ChartNotFound` before Jira is called, so a typo'd chart id does not cost
 * twenty-four round-trips; `JiraUnreachable` only when Jira answered for nothing
 * at all, and then `chart.json` is byte-identical because the write is
 * downstream of the gather.
 */
export function seedDatesFromHistory(
  chartId: string,
  writes: GanttWrites,
): Effect.Effect<GanttChart, SeedDatesError, JiraGateway> {
  return Effect.promise(() => readChart(chartId, writes.deps)).pipe(
    Effect.flatMap((chart) =>
      chart === null
        ? Effect.fail<SeedDatesError>(new ChartNotFound({ chartId }))
        : gatherSpans(chartId, keysToAsk(chart)),
    ),
    Effect.flatMap((spans) => writeSeeded(writes, chartId, spans)),
  )
}
