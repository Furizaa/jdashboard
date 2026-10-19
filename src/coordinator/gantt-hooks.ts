import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  GetGanttBodyResult,
  GetGanttChangelogResult,
  GetGanttChartResult,
  ListGanttChartsResult,
  SyncGanttChartResult,
} from '~/kernel'
import {
  getGanttBody,
  getGanttChangelog,
  getGanttChart,
  listGanttCharts,
  syncGanttChart,
} from '~/server/server-functions/gantt'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from './adapters/tanstack-cache'

// The coordinator's Gantt adapters. They live apart from `hooks.ts` for the
// reason `explain-hooks.ts` does — that file is already the app's longest and a
// surface's whole read side belongs together.
//
// Four reads and **one** write, and the one write is not an exception to the
// agent being the chart's only writer (ADR-0012 §8): sync touches only the
// mirrored half Jira owns, never a lane, a date or a body an agent authored.
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
