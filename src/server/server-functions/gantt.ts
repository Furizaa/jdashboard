import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { Effect, Schema } from 'effect'
import { readChartChangelog, type GanttChangelogEntry } from '../lib/gantt-changelog-store'
import { assertChartId, assertNodeId, type GanttChart } from '../lib/gantt-schema'
import { renderGanttSkill } from '../lib/gantt-skill'
import type { GanttChartSummary } from '../lib/gantt-store'
import { liveGanttWrites, liveGanttWritesDeps, type GanttWritesDeps } from '../lib/gantt-writes'
import { archiveChartById } from '../contexts/gantt/application/archive-chart'
import {
  loadChart,
  loadChartList,
  loadKeyIndex,
  loadNodeBody,
  type GanttBodyView,
  type GanttChartView,
  type GanttKeyIndex,
} from '../contexts/gantt/application/load-chart'
import { syncChart } from '../contexts/gantt/application/sync-chart'
import {
  ChartNotFound,
  InvalidChartPayload,
  JiraUnreachable,
  NodeNotFound,
} from '../contexts/gantt/errors'
import type { WireResult } from '../wire/to-wire'
import { runWire } from './run-wire'

// The Gantt surface's **read side**, plus the two lifecycle verbs the **human**
// owns rather than the agent — `syncGanttChart` and `archiveGanttChart`
// (ADR-0012 §8). The UI is read-only about chart *content*: the agent is the
// chart's one writer and it writes over the REST contract in `routes/api/`.
// Neither verb is an exception to that. Sync writes nothing the agent authored,
// only the mirrored half Jira owns; archive does not write a chart at all, it
// moves the folder, and it is deliberately absent from the REST surface.
//
// Ordinary ADR-0005 JSON-RPC: the use-cases live in
// `server/contexts/gantt/application/load-chart.ts` because the REST routes call
// the same ones (ADR-0012 §7), and nothing is re-derived here — `hasBody` in
// particular is the application layer's, derived from one directory read.
//
// The two reads that cannot fail (the chart list and the changelog) return a
// plain object rather than a wire envelope, as `notes.ts` does for the same
// reason: both stores read fault-tolerantly to empty, so an `{ ok: false }` arm
// would be a branch no caller can ever reach.

export type ListGanttChartsResult = { readonly charts: readonly GanttChartSummary[] }

/** Jira key → where it sits in the plan. The palette's legality input for `g`. */
export type GetGanttKeyIndexResult = { readonly byKey: GanttKeyIndex }

type ChartNotFoundWire = Schema.Schema.Encoded<typeof ChartNotFound>
type NodeNotFoundWire = Schema.Schema.Encoded<typeof NodeNotFound>

export type GetGanttChartResult = WireResult<{ readonly chart: GanttChartView }, ChartNotFoundWire>

export type GetGanttBodyResult = WireResult<
  { readonly body: GanttBodyView },
  ChartNotFoundWire | NodeNotFoundWire
>

export type GetGanttChangelogResult = { readonly entries: readonly GanttChangelogEntry[] }

/** The parameterised SKILL, as the text the copy button puts on the clipboard. */
export type GetGanttSkillResult = { readonly skill: string }

export type SyncGanttChartResult = WireResult<
  { readonly chart: GanttChart },
  | ChartNotFoundWire
  | Schema.Schema.Encoded<typeof JiraUnreachable>
  | Schema.Schema.Encoded<typeof InvalidChartPayload>
>

export type ArchiveGanttChartResult = WireResult<{ readonly archivedTo: string }, ChartNotFoundWire>

/** The three a sync can fail with — Jira silent, chart gone, chart unwritable. */
const SyncGanttChartError = Schema.Union(ChartNotFound, JiraUnreachable, InvalidChartPayload)

/** A node's body needs the chart to exist before "no body" means anything. */
const GetGanttBodyError = Schema.Union(ChartNotFound, NodeNotFound)

/**
 * The store deps the **UI** gets: reads work, writes refuse.
 *
 * `readOnlyNotesDeps` in `agent-ticket-context.ts` establishes the shape, and
 * here it is load-bearing rather than tidy. ADR-0012 §8 makes the agent the
 * chart's only writer, so a write reached through a server function would be the
 * one thing this surface promises not to do — and a refusing dep makes that a
 * rejected promise rather than a comment.
 */
const refuse = () => Promise.reject(new Error('the Gantt surface is read-only'))

/**
 * Built from the live deps with **every** write verb replaced rather than from
 * its own `node:fs` calls, so there is one place that knows how this store
 * reaches the disk and the read-only variant reads as what it is: the real
 * thing, with writing taken away.
 */
function readOnlyStoreDeps(): GanttWritesDeps {
  return {
    ...liveGanttWritesDeps(),
    writeFile: refuse,
    mkdir: refuse,
    rename: refuse,
    deleteFile: refuse,
  }
}

/**
 * Where this server can be reached, as the browser just reached it. `null`
 * outside a request context, which is the test and prerender case rather than
 * anything a user can provoke; `renderGanttSkill` then uses its documented
 * localhost fallback.
 */
function requestOrigin(): string | null {
  try {
    return getRequestUrl().origin
  } catch {
    return null
  }
}

function requireChartId(label: string, value: unknown): string {
  return assertChartId(typeof value === 'string' ? value : '', label)
}

function requireNodeId(label: string, value: unknown): string {
  return assertNodeId(typeof value === 'string' ? value : '', label)
}

export const listGanttCharts = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ListGanttChartsResult> => ({
    charts: await Effect.runPromise(loadChartList(readOnlyStoreDeps())),
  }),
)

/**
 * The reverse index the command palette judges `show-in-gantt` against: every
 * mirrored Jira key on any chart, to the lane that carries it.
 *
 * A read that cannot fail, like the chart list and for the same reason — a chart
 * whose `chart.json` is unreadable is skipped rather than thrown over, so the
 * only answer is a record that may be empty.
 */
export const getGanttKeyIndex = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetGanttKeyIndexResult> => ({
    byKey: await Effect.runPromise(loadKeyIndex(readOnlyStoreDeps())),
  }),
)

/**
 * One chart's skeleton — the tree, the edges, and a `hasBody` flag per node. The
 * bodies are **not** here: a chart whose lanes each carry a PRD would otherwise
 * ship every one of them to render a row of titles.
 */
export const getGanttChart = createServerFn({ method: 'GET' })
  .inputValidator((data: { chartId: string }) => ({
    chartId: requireChartId('getGanttChart', data?.chartId),
  }))
  .handler(({ data }): Promise<GetGanttChartResult> => {
    const program = loadChart(data.chartId, readOnlyStoreDeps()).pipe(
      Effect.map((chart) => ({ chart })),
    )
    return runWire(program, ChartNotFound, 'getGanttChart')
  })

/** One lane's markdown body, fetched when its info band is opened and not before. */
export const getGanttBody = createServerFn({ method: 'GET' })
  .inputValidator((data: { chartId: string; nodeId: string }) => ({
    chartId: requireChartId('getGanttBody', data?.chartId),
    nodeId: requireNodeId('getGanttBody', data?.nodeId),
  }))
  .handler(({ data }): Promise<GetGanttBodyResult> => {
    const program = loadNodeBody(data.chartId, data.nodeId, readOnlyStoreDeps()).pipe(
      Effect.map((body) => ({ body })),
    )
    return runWire(program, GetGanttBodyError, 'getGanttBody')
  })

/**
 * "What has the agent been doing to my plan", which ADR-0012 §11 makes part of
 * the visibility the feature exists for rather than a debugging aid. Oldest
 * first, as stored; the view orders it for display.
 */
export const getGanttChangelog = createServerFn({ method: 'GET' })
  .inputValidator((data: { chartId: string }) => ({
    chartId: requireChartId('getGanttChangelog', data?.chartId),
  }))
  .handler(
    async ({ data }): Promise<GetGanttChangelogResult> => ({
      entries: await readChartChangelog(data.chartId, readOnlyStoreDeps()),
    }),
  )

/**
 * Refresh the mirrored half of one chart — the header's Refresh, and the
 * stale-on-open trigger five minutes after a chart was last synced (ADR-0012
 * §5). The same application service the REST route calls, which is the whole
 * point of it living in `application/` (ADR-0012 §7).
 *
 * This one hands the **live write queue** rather than the read-only deps above:
 * a sync writes, and it must serialise against whatever the agent is doing to
 * the same chart. That is the one queue in the process, so it does.
 */
export const syncGanttChart = createServerFn({ method: 'POST' })
  .inputValidator((data: { chartId: string }) => ({
    chartId: requireChartId('syncGanttChart', data?.chartId),
  }))
  .handler(({ data }): Promise<SyncGanttChartResult> => {
    const program = syncChart(data.chartId, liveGanttWrites()).pipe(
      Effect.map((chart) => ({ chart })),
    )
    return runWire(program, SyncGanttChartError, 'syncGanttChart')
  })

/**
 * Archive one chart — the **other** lifecycle verb the human owns, and the
 * reason the REST surface has no `DELETE /charts/:chartId` for an agent to
 * reach (ADR-0012 §8). The folder moves to `gantt/.archive/`; nothing is
 * erased, and the confirmation naming the chart is the UI's half of the bargain.
 *
 * Like sync, this takes the **live write queue** rather than the read-only deps:
 * the folder is about to move, and it must not move out from under a write the
 * agent has in flight against the same chart.
 */
export const archiveGanttChart = createServerFn({ method: 'POST' })
  .inputValidator((data: { chartId: string }) => ({
    chartId: requireChartId('archiveGanttChart', data?.chartId),
  }))
  .handler(({ data }): Promise<ArchiveGanttChartResult> => {
    const program = archiveChartById(data.chartId, liveGanttWrites())
    return runWire(program, ChartNotFound, 'archiveGanttChart')
  })

/**
 * The SKILL that teaches the REST contract, with this server's origin and the
 * open chart's id already substituted (ADR-0012 §12). The header's copy button
 * is the only caller; `GET /api/gantt/skill` serves the same text to an agent
 * that would rather fetch it.
 *
 * The origin comes from the request rather than from a constant, because the
 * one thing a pasted SKILL must get right is the URL the agent will call — and
 * the only authority on that is the request the browser just made. It is read
 * defensively: outside a request context there is nothing to read, and a
 * documented localhost fallback is better than a failed copy.
 */
export const getGanttSkill = createServerFn({ method: 'GET' })
  .inputValidator((data: { chartId: string }) => ({
    chartId: requireChartId('getGanttSkill', data?.chartId),
  }))
  .handler(
    async ({ data }): Promise<GetGanttSkillResult> => ({
      skill: await renderGanttSkill({ baseUrl: requestOrigin(), chartId: data.chartId }),
    }),
  )
