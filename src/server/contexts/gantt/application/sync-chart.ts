import { Effect } from 'effect'
import type { JiraGatewayError } from '../../../gateways/jira/errors'
import { JiraGateway } from '../../../gateways/jira/port'
import type { RawDetailedIssue, RawIssue, RawIssueLink } from '../../../gateways/jira/types'
import { ganttChartSchema, toIssues, type GanttChart } from '../../../lib/gantt-schema'
import { readChart, writeChart } from '../../../lib/gantt-store'
import { recordChange, type GanttWrites } from '../../../lib/gantt-writes'
import { discoveryJql } from '../domain/discovery-jql'
import {
  applyReconciliation,
  countsOf,
  NO_RECONCILIATION,
  reconcile,
  type DiscoveredIssue,
  type DiscoveredLink,
  type ReconciliationCounts,
} from '../domain/reconcile'
import { ChartNotFound, InvalidChartPayload, JiraUnreachable } from '../errors'

// `POST /charts/:chartId/sync` — the verb that keeps a chart's mirrored half
// current **without ever moving or deleting a node** (ADR-0012 §5).
//
// Sync is a verb and not a side effect of a read, for two reasons this file is
// shaped by: an agent doing a cheap id lookup would otherwise pay a Jira
// round-trip and silently mutate the chart it was only looking at, and interval
// polling would mean a Jira search plus a disk write per open chart per tick for
// data that changes a few times a day. clashboard's policy is
// stale-while-revalidate plus an explicit refresh, and sync follows it: the UI
// fires this when a chart older than five minutes is opened, and on Refresh.
//
// The decisions are all in `domain/reconcile.ts`. What is left here is the I/O
// order, and that order is the whole of the "byte-identical on failure"
// guarantee: **discover first, write second.** Nothing is opened for writing
// until Jira has answered.

/**
 * One search, covering the mirrored fields and the whole epic's links together
 * (ADR-0012 §6) — `searchIssues` takes a field array, so a chart of forty
 * tickets with their dependencies costs one call rather than forty-one.
 *
 * `BOARD_FIELDS` is deliberately untouched: the two paths want different fields
 * and sharing a list would couple a board render to a sync.
 */
export const GANTT_SYNC_FIELDS = [
  'summary',
  'status',
  'assignee',
  'issuetype',
  'parent',
  'issuelinks',
] as const

/**
 * The fields a **mirror-by-key** read needs, which is the mirrored half and
 * nothing else. No `issuelinks`: a ticket outside this chart's epics is not
 * evidence about the epic's dependency graph. No `parent` either — Jira's parent
 * is a one-time import suggestion (ADR-0012 §5) and a node reached this way was
 * placed by the agent that created it.
 */
export const GANTT_MIRROR_FIELDS = ['summary', 'status', 'assignee'] as const

/** How many mirror-by-key reads are in flight at once. `seed-dates.ts`'s five. */
export const GANTT_MIRROR_CONCURRENCY = 5

/** Jira's name for the relationship a Gantt arrow draws. Compared case-folded. */
const BLOCKS_LINK_TYPE = 'blocks'

/**
 * Jira reports one dependency twice — `outward` on the blocker, `inward` on the
 * blocked issue — and an epic's search returns both ends. Normalising to
 * `blocker → blocked` here is what lets `reconcile` dedupe by pair; `load-issue`
 * keeps the direction instead because the detail panel renders both phrasings.
 */
function toDiscoveredLinks(key: string, links: readonly RawIssueLink[]): DiscoveredLink[] {
  const normalised: DiscoveredLink[] = []
  for (const link of links) {
    if (link.type.name.toLowerCase() !== BLOCKS_LINK_TYPE) continue
    if (link.outwardIssue !== undefined) {
      normalised.push({ linkId: link.id, blockerKey: key, blockedKey: link.outwardIssue.key })
    } else if (link.inwardIssue !== undefined) {
      normalised.push({ linkId: link.id, blockerKey: link.inwardIssue.key, blockedKey: key })
    }
  }
  return normalised
}

function toDiscoveredIssue(issue: RawIssue): DiscoveredIssue {
  return {
    key: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status.name,
    assignee: issue.fields.assignee?.displayName ?? null,
    parentKey: issue.fields.parent?.key ?? null,
    links: toDiscoveredLinks(issue.key, issue.fields.issuelinks ?? []),
  }
}

/**
 * One ticket read by key rather than found by a search. `links` is `[]` and
 * `parentKey` is `null` as a matter of type rather than of the response: neither
 * was asked for, and `reconcile` must not read a cross-epic ticket as evidence
 * about this chart's epic.
 */
function toMirroredIssue(issue: RawDetailedIssue): DiscoveredIssue {
  return {
    key: issue.key,
    title: issue.fields.summary,
    status: issue.fields.status.name,
    assignee: issue.fields.assignee?.displayName ?? null,
    parentKey: null,
    links: [],
  }
}

/**
 * What one discovery search saw, and whether it saw all of it.
 *
 * `authoritative` is the answer to the only question orphaning depends on: *can
 * this search be read as the whole epic?* Marking a node orphaned is an argument
 * from **absence** — the key was not in the result — and an argument from absence
 * is only valid over a complete result.
 */
export type Discovery = {
  readonly issues: readonly DiscoveredIssue[]
  readonly authoritative: boolean
}

/**
 * The tickets behind a chart's epics. Every gateway failure becomes
 * `JiraUnreachable`: unauthorized, rejected and transport are three different
 * facts about Jira and one fact about this call — the mirrored half could not be
 * read — and the caller's only remedy for any of them is to try again later.
 *
 * Two results are **not** authoritative, and in both cases reading them as the
 * whole epic would orphan most of the chart:
 *
 *   - **A truncated search.** The gateway caps a search at 100 issues and does
 *     not page, so a larger epic discovers a prefix. `nextPageToken` / `isLast`
 *     say when that happened, which is better than inferring it from a count.
 *     Paging is the upgrade path; the trigger is the first epic that large.
 *   - **An empty result against real sources.** An epic whose every child has
 *     genuinely left is possible and vanishingly rare; a mistyped epic key, a
 *     renamed project or a Jira that answered oddly are none of those things and
 *     all look identical here. Being wrong in the conservative direction costs a
 *     badge that does not appear. Being wrong in the other direction badges the
 *     whole plan.
 *
 * Additions and mirror updates stay trustworthy either way — they are arguments
 * from presence, and this search did see those tickets. This is the same rule
 * `reconcileEdges` already applies when it removes a jira edge only if *both* of
 * its tickets were in the result.
 */
export function discoverIssues(
  chartId: string,
  jiraSources: readonly string[],
): Effect.Effect<Discovery, JiraUnreachable, JiraGateway> {
  const jql = discoveryJql(jiraSources)
  if (jql === null) return Effect.succeed({ issues: [], authoritative: false })
  return Effect.gen(function* () {
    const jira = yield* JiraGateway
    const response = yield* jira
      .searchIssues(jql, GANTT_SYNC_FIELDS)
      .pipe(Effect.mapError((error) => unreachable(chartId, error)))
    const truncated = response.nextPageToken !== undefined || response.isLast === false
    const issues = response.issues.map(toDiscoveredIssue)
    return { issues, authoritative: !truncated && issues.length > 0 }
  })
}

/**
 * The jira keys sync has to read **by key**, because no discovery search for this
 * chart will return them: a node whose `discovered` is still `false` and whose key
 * this search did not return either. That is the cross-epic blocker — a release
 * gate living in a different epic is the normal case for a front-end epic waiting
 * on a backend — accepted through `POST /nodes`, mirrored like any other ticket,
 * and never orphaned (ADR-0012 §5, as narrowed).
 *
 * An **already-discovered** node that has dropped out of the search is not here.
 * It has its `orphaned` badge, which is the answer to "where did this go", and
 * paying a round-trip per departed ticket on every sync to refresh a lane the
 * chart is already telling you has left is a cost nobody asked for.
 *
 * Computed **after** the search, so a chart whose nodes the search did return
 * costs nothing extra — which is what keeps a freshly migrated chart, where every
 * node starts `discovered: false`, from paying a `getIssue` per lane.
 */
function mirrorOnlyKeys(chart: GanttChart, discovery: Discovery): readonly string[] {
  const returned = new Set(discovery.issues.map((issue) => issue.key.toUpperCase()))
  const keys = new Set<string>()
  for (const node of chart.nodes) {
    if (node.source.kind !== 'jira' || node.discovered) continue
    if (returned.has(node.source.key.toUpperCase())) continue
    keys.add(node.source.key)
  }
  return [...keys]
}

/**
 * One `getIssue` per such key, five at a time, and **a failure per key rather
 * than for the run**: one cross-epic lane whose mirrored half could not be read
 * must not cost the sync its write, which is the judgement `seed-dates.ts` makes
 * per ticket. A key Jira will not answer for is simply absent from the result,
 * and the node keeps the fields it had.
 *
 * `never` in the error channel is the point: nothing here can fail the sync.
 */
function readMirrorOnly(
  keys: readonly string[],
): Effect.Effect<readonly DiscoveredIssue[], never, JiraGateway> {
  if (keys.length === 0) return Effect.succeed([])
  return Effect.gen(function* () {
    const jira = yield* JiraGateway
    const read = yield* Effect.forEach(
      keys,
      (key) =>
        jira.getIssue(key, GANTT_MIRROR_FIELDS).pipe(
          Effect.map((issue): DiscoveredIssue | null => toMirroredIssue(issue)),
          Effect.catchAll(() => Effect.succeed(null)),
        ),
      { concurrency: GANTT_MIRROR_CONCURRENCY },
    )
    return read.filter((issue): issue is DiscoveredIssue => issue !== null)
  })
}

const unreachable = (chartId: string, error: JiraGatewayError): JiraUnreachable =>
  new JiraUnreachable({
    chartId,
    // oxlint-disable-next-line no-underscore-dangle -- `_tag` is the standard discriminator on Effect Schema tagged errors
    message: `Jira did not answer the discovery search (${error._tag})`,
  })

/** `3 updated · 2 added · 1 orphaned`, and the edges beside them. */
function summarize(sources: readonly string[], counts: ReconciliationCounts): string {
  const from = sources.length === 0 ? 'no Jira sources' : sources.join(', ')
  return (
    `synced from ${from}: ${counts.updated} updated · ${counts.added} added · ` +
    `${counts.orphaned} orphaned · ${counts.edgesAdded} edges added · ` +
    `${counts.edgesRemoved} edges removed · ${counts.edgesPromoted} edges promoted`
  )
}

type Outcome =
  | { readonly ok: true; readonly chart: GanttChart }
  | { readonly ok: false; readonly error: ChartNotFound | InvalidChartPayload }

export type SyncChartError = ChartNotFound | JiraUnreachable | InvalidChartPayload

/**
 * The one write, inside the one lock.
 *
 * The chart is read **again** here rather than being carried in from the
 * discovery step: the search is a network round-trip, and a reconciliation
 * computed against a chart an agent has since written a node into would put the
 * node back. Reading inside the critical section is what makes read-modify-write
 * atomic for the price of one more local file read.
 *
 * The schema check before the write is the system-of-record guard
 * `mutate-chart.ts` explains: `readChart` treats an invalid `chart.json` as
 * **absent**, so a write the schema would reject must not land — it would not
 * corrupt the plan, it would make it disappear.
 */
function writeSynced(
  writes: GanttWrites,
  chartId: string,
  discovery: Discovery,
  mirrorOnly: readonly DiscoveredIssue[],
): Effect.Effect<GanttChart, ChartNotFound | InvalidChartPayload> {
  return Effect.promise<Outcome>(() =>
    writes.withChartLock(chartId, async (): Promise<Outcome> => {
      const chart = await readChart(chartId, writes.deps)
      if (chart === null) return { ok: false, error: new ChartNotFound({ chartId }) }
      // No sources means no search, and a reconciliation against an empty
      // discovery would orphan every mirrored node in the chart. The chart still
      // gets its `lastSyncedAt`: it was synced, there was simply nothing to ask.
      // A chart with no epics can still carry jira lanes an agent created by key,
      // though, and those were read: mirroring them is the whole point of the
      // read, so a mirror-only result is a reason to reconcile after all.
      //
      // When the search was not authoritative (truncated, or empty against real
      // sources — see `Discovery`) everything it positively saw is still applied
      // and only the orphan marks are dropped. ADR-0012 §5 promises sync never
      // destroys; badging a whole plan because one search came back short is the
      // destruction that promise is about. `orphanedIds: []` is expressible in
      // the type, which is why this needs no second code path.
      const full =
        chart.jiraSources.length === 0 && mirrorOnly.length === 0
          ? NO_RECONCILIATION
          : reconcile(chart, discovery.issues, mirrorOnly)
      const change = discovery.authoritative ? full : { ...full, orphanedIds: [] }
      const next: GanttChart = {
        ...applyReconciliation(chart, change),
        lastSyncedAt: writes.deps.now(),
      }
      const parsed = ganttChartSchema.safeParse(next, { reportInput: true })
      if (!parsed.success) {
        return {
          ok: false,
          error: new InvalidChartPayload({
            message: 'the sync would have left the chart invalid, so nothing was written',
            issues: toIssues(parsed.error),
          }),
        }
      }
      await writeChart(parsed.data, writes.deps)
      // Exactly one entry per sync, inside the same critical section as the
      // write it describes (ADR-0012 §11), and `sync` rather than `agent`:
      // "what has been done to my plan" distinguishes the two.
      await recordChange(writes, chartId, 'sync', summarize(chart.jiraSources, countsOf(change)))
      return { ok: true, chart: parsed.data }
    }),
  ).pipe(
    Effect.flatMap((outcome) =>
      outcome.ok ? Effect.succeed(outcome.chart) : Effect.fail(outcome.error),
    ),
  )
}

/**
 * Sync an existing chart. `ChartNotFound` before Jira is called, so a typo'd
 * chart id does not cost a round-trip; `JiraUnreachable` leaves `chart.json`
 * exactly as it was, because the write is downstream of the search.
 */
export function syncChart(
  chartId: string,
  writes: GanttWrites,
): Effect.Effect<GanttChart, SyncChartError, JiraGateway> {
  return Effect.gen(function* () {
    const chart = yield* Effect.promise(() => readChart(chartId, writes.deps))
    if (chart === null) return yield* Effect.fail<SyncChartError>(new ChartNotFound({ chartId }))
    // Discover, then mirror what discovery cannot reach, then write. Still one
    // write downstream of every read, so `JiraUnreachable` leaves `chart.json`
    // byte-identical — and the mirror reads come second so they can be asked only
    // about the keys the search did not already answer for.
    const discovery = yield* discoverIssues(chartId, chart.jiraSources)
    const mirrorOnly = yield* readMirrorOnly(mirrorOnlyKeys(chart, discovery))
    return yield* writeSynced(writes, chartId, discovery, mirrorOnly)
  })
}
