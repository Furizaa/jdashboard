import { readdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import { Effect, Schema } from 'effect'
import {
  readChartChangelog,
  type GanttChangelogEntry,
  type GanttChangelogStoreDeps,
} from '../lib/gantt-changelog-store'
import { assertChartId, assertNodeId, type GanttChart } from '../lib/gantt-schema'
import type { GanttChartSummary, GanttStoreDeps } from '../lib/gantt-store'
import { liveGanttWrites } from '../lib/gantt-writes'
import {
  loadChart,
  loadChartList,
  loadNodeBody,
  type GanttBodyView,
  type GanttChartView,
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

// The Gantt surface's **read side**, plus `syncGanttChart` (ADR-0012 §8). The
// UI is read-only about chart *content*: the agent is the chart's one writer and
// it writes over the REST contract in `routes/api/`. Sync is not an exception to
// that — it writes nothing the agent authored, only the mirrored half Jira owns,
// and it is one of the two lifecycle verbs the **human** owns rather than the
// agent (archive is the other, and arrives with slice 96).
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

type ChartNotFoundWire = Schema.Schema.Encoded<typeof ChartNotFound>
type NodeNotFoundWire = Schema.Schema.Encoded<typeof NodeNotFound>

export type GetGanttChartResult = WireResult<{ readonly chart: GanttChartView }, ChartNotFoundWire>

export type GetGanttBodyResult = WireResult<
  { readonly body: GanttBodyView },
  ChartNotFoundWire | NodeNotFoundWire
>

export type GetGanttChangelogResult = { readonly entries: readonly GanttChangelogEntry[] }

export type SyncGanttChartResult = WireResult<
  { readonly chart: GanttChart },
  | ChartNotFoundWire
  | Schema.Schema.Encoded<typeof JiraUnreachable>
  | Schema.Schema.Encoded<typeof InvalidChartPayload>
>

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

function readOnlyStoreDeps(): GanttStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    readDir: (p) => readdir(p),
    writeFile: refuse,
    mkdir: refuse,
    rename: refuse,
    now: () => new Date().toISOString(),
  }
}

function changelogDeps(): GanttChangelogStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: refuse,
    mkdir: refuse,
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
      entries: await readChartChangelog(data.chartId, changelogDeps()),
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
