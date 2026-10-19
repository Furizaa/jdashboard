import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  ArchiveGanttChartResult,
  GetGanttBodyResult,
  GetGanttChangelogResult,
  GetGanttChartResult,
  GetGanttKeyIndexResult,
  GetGanttSkillResult,
  ListGanttChartsResult,
  SeedGanttDatesResult,
  SyncGanttChartResult,
} from '~/kernel'
import {
  archiveGanttChart,
  getGanttBody,
  getGanttChangelog,
  getGanttChart,
  getGanttKeyIndex,
  getGanttSkill,
  listGanttCharts,
  seedGanttDates,
  syncGanttChart,
} from '~/server/server-functions/gantt'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from './adapters/tanstack-cache'

// The coordinator's Gantt adapters. They live apart from `hooks.ts` for the
// reason `explain-hooks.ts` does — that file is already the app's longest and a
// surface's whole read side belongs together.
//
// Six reads and **three** writes, and none of the three is an exception to the
// agent being the chart's only writer (ADR-0012 §8): sync touches only the
// mirrored half Jira owns, never a lane or a body an agent authored; seeding
// dates writes `start` and `end` but only where they are `null`, so a date the
// agent set is a date it keeps; and archive is a chart *lifecycle* verb the human
// owns — it moves the folder rather than editing a plan, which is why there is no
// `DELETE /charts/:chartId` beside it.
//
// The wire types come through `~/kernel`, as the kernel rule asks: the values
// below are server functions and must be imported from their module, but their
// result shapes are kernel vocabulary.

/** Every chart on disk — header fields and the two counts a list row needs. */
export function useGanttCharts(): UseQueryResult<ListGanttChartsResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ganttCharts,
    queryFn: () => listGanttCharts(),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.ganttCharts,
  })
}

/**
 * One chart's skeleton. `null` is the surface with no chart selected, which is
 * the chart list — so the query is disabled rather than fetching a chart called
 * nothing.
 */
export function useGanttChart(chartId: string | null): UseQueryResult<GetGanttChartResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ganttChart(chartId ?? '__none__'),
    queryFn: () => getGanttChart({ data: { chartId: chartId as string } }),
    enabled: chartId !== null,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.ganttChart,
  })
}

/**
 * One lane's markdown body, fetched **only once its info band is open**. That is
 * what `enabled` is for here: a chart of forty lanes with PRDs attached costs one
 * skeleton read to draw, and a body read per band the reader actually opens.
 */
export function useGanttBody(
  chartId: string | null,
  nodeId: string | null,
): UseQueryResult<GetGanttBodyResult> {
  const enabled = chartId !== null && nodeId !== null
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ganttBody(chartId ?? '__none__', nodeId ?? '__none__'),
    queryFn: () => getGanttBody({ data: { chartId: chartId as string, nodeId: nodeId as string } }),
    enabled,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.ganttBody,
  })
}

/** The chart's append-only audit trail — what the agent did, and when. */
export function useGanttChangelog(chartId: string | null): UseQueryResult<GetGanttChangelogResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ganttChangelog(chartId ?? '__none__'),
    queryFn: () => getGanttChangelog({ data: { chartId: chartId as string } }),
    enabled: chartId !== null,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.ganttChangelog,
  })
}

/**
 * Refresh one chart's mirrored half. The header's Refresh calls `sync`, and so
 * does the stale-on-open trigger in the presenter — one verb, one in-flight
 * flag, so neither can run while the other is.
 *
 * `isPending` is the whole concurrency story. A mutation is already serialised
 * against itself here (react-query will not start a second one from the same
 * hook instance while the first is in flight) and the server's per-chart write
 * queue is the backstop if two surfaces ask at once.
 *
 * On success the chart, the list and the changelog are all invalidated: the
 * chart's rows changed, its `lastSyncedAt` changed — which is what the
 * stale-on-open guard reads — and one `actor: 'sync'` entry was appended.
 */
export function useSyncGanttChart(): {
  sync: (chartId: string) => Promise<SyncGanttChartResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<SyncGanttChartResult, Error, { chartId: string }>({
    mutationFn: (data) => syncGanttChart({ data }),
    onSuccess: (_result, { chartId }) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttChart(chartId) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttCharts })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttChangelog(chartId) })
    },
  })
  return {
    sync: (chartId) => mutation.mutateAsync({ chartId }),
    isPending: mutation.isPending,
  }
}

/**
 * Fill this chart's blank dates from its tickets' status histories (ADR-0012
 * §4, as amended) — the header's companion to Refresh.
 *
 * Invalidates the same three keys sync does, and for the same three reasons: the
 * rows now have bars, the list's counts are read off the chart, and one
 * `actor: 'sync'` entry naming the counts was appended. `isPending` is the whole
 * concurrency story, exactly as it is for sync.
 */
export function useSeedGanttDates(): {
  seedDates: (chartId: string) => Promise<SeedGanttDatesResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<SeedGanttDatesResult, Error, { chartId: string }>({
    mutationFn: (data) => seedGanttDates({ data }),
    onSuccess: (_result, { chartId }) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttChart(chartId) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttCharts })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttChangelog(chartId) })
    },
  })
  return {
    seedDates: (chartId) => mutation.mutateAsync({ chartId }),
    isPending: mutation.isPending,
  }
}

/**
 * Which tickets appear anywhere in the plan. The command palette reads this to
 * decide whether `g` — Show in Gantt — is legal for the item in front of you,
 * and nothing else does.
 *
 * One query for every chart rather than one per chart, because the question is
 * a membership test over all of them. The 60s stale time is the longest of the
 * Gantt keys: a key joins or leaves a chart when an agent writes, not on its own.
 */
export function useGanttKeyIndex(): UseQueryResult<GetGanttKeyIndexResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.ganttKeyIndex,
    queryFn: () => getGanttKeyIndex(),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.ganttKeyIndex,
  })
}

/**
 * Archive one chart — the confirmed, human-owned end of a chart's life
 * (ADR-0012 §8). The folder moves to `gantt/.archive/`; nothing is erased.
 *
 * Only the **list** and the key index are invalidated, deliberately. The chart's
 * own query is left alone because the caller navigates away from it in the same
 * breath, and invalidating it would fire one more read of a folder that has just
 * moved — a guaranteed `ChartNotFound` with nothing to show for it.
 */
export function useArchiveGanttChart(): {
  archive: (chartId: string) => Promise<ArchiveGanttChartResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<ArchiveGanttChartResult, Error, { chartId: string }>({
    mutationFn: (data) => archiveGanttChart({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttCharts })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.ganttKeyIndex })
    },
  })
  return {
    archive: (chartId) => mutation.mutateAsync({ chartId }),
    isPending: mutation.isPending,
  }
}

/**
 * The SKILL that teaches the REST API, fetched **on demand** rather than held in
 * the cache: it is one file read on the server, nobody looks at it until the
 * copy button is pressed, and a cached copy would be a second answer to "what is
 * the contract" the moment the document is edited.
 *
 * A mutation rather than a query for the same reason the Explain surface's
 * one-shot calls are: the work starts when the user asks for it, and `isPending`
 * is the button's disabled state. Nothing is invalidated — this reads a file and
 * writes nothing.
 */
export function useGanttSkill(): {
  readSkill: (chartId?: string | null) => Promise<GetGanttSkillResult>
  isPending: boolean
} {
  const mutation = useMutation<GetGanttSkillResult, Error, { chartId: string | null }>({
    mutationFn: (data) => getGanttSkill({ data }),
  })
  return {
    readSkill: (chartId) => mutation.mutateAsync({ chartId: chartId ?? null }),
    isPending: mutation.isPending,
  }
}
