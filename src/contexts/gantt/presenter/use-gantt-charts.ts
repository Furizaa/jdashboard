import { useGanttCharts as useGanttChartsQuery, useGanttChangelog } from '~/coordinator'
import type { GanttChangelogEntry, GanttChartSummary } from '~/kernel'

// The list presenter: every chart on disk, as the landing state of `/gantt`.
//
// The summaries are the store's, counts included — a list of twenty charts must
// not carry every node in all of them — so there is nothing to derive here
// beyond which of the four phases the surface is in.

export type ChartListApi =
  | { readonly phase: 'loading' }
  | { readonly phase: 'error'; readonly message: string }
  /** No charts at all, which is what a fresh install looks like. */
  | { readonly phase: 'empty' }
  | { readonly phase: 'ready'; readonly charts: readonly GanttChartSummary[] }

export function useChartList(): ChartListApi {
  const query = useGanttChartsQuery()
  if (query.isError) {
    return {
      phase: 'error',
      message: query.error instanceof Error ? query.error.message : 'The charts could not be read.',
    }
  }
  if (query.data === undefined) return { phase: 'loading' }
  if (query.data.charts.length === 0) return { phase: 'empty' }
  return { phase: 'ready', charts: query.data.charts }
}

/**
 * One chart's audit trail, newest first. The store appends, so the order on disk
 * is oldest-first and the reversal is a presentation choice — "what has the
 * agent just done" is the question the popover answers.
 */
export function useChartChangelog(chartId: string): {
  readonly entries: readonly GanttChangelogEntry[]
  readonly isLoading: boolean
} {
  const query = useGanttChangelog(chartId)
  return {
    entries: query.data === undefined ? [] : query.data.entries.toReversed(),
    isLoading: query.data === undefined && query.isFetching,
  }
}
