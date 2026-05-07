import { useMemo } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useBoardData, useMrStatuses } from '~/dashboard'
import { usePolling } from '~/lib/use-polling'
import type { SearchIssuesResult } from '~/server/jira'
import { useChangeIndication } from './use-change-indication'
import { assembleColumns, type ColumnItem } from './assemble-columns'
import type { Column } from './status-mapping'

export const BOARD_POLL_INTERVAL_MS = 60_000

export type BoardViewDeps = {
  boardQuery: UseQueryResult<SearchIssuesResult>
  /** Called once per render. Production wires `useMrStatuses`; tests pass a no-op. */
  subscribeMrStatuses: () => void
}

type ReadyFields = {
  baseUrl: string
  itemsByColumn: Record<Column, ColumnItem[]>
  showErrorBanner: boolean
  errorMessage: string | undefined
  retry: () => void
}

export type BoardViewState =
  | { phase: 'loading' }
  | { phase: 'error-hard'; message: string }
  | { phase: 'unauthorized' }
  | { phase: 'empty' }
  | (ReadyFields & { phase: 'ready' })

export function useBoardView(searchQuery: string): BoardViewState {
  const boardQuery = useBoardData()
  return useBoardViewWithDeps(searchQuery, {
    boardQuery,
    subscribeMrStatuses: () => {
      useMrStatuses()
    },
  })
}

export function useBoardViewWithDeps(searchQuery: string, deps: BoardViewDeps): BoardViewState {
  const { boardQuery } = deps
  deps.subscribeMrStatuses()
  usePolling(() => {
    boardQuery.refetch()
  }, BOARD_POLL_INTERVAL_MS)

  const liveIssues = boardQuery.data?.ok === true ? boardQuery.data.issues : undefined
  const { enteringKeys, changedKeys, leaving } = useChangeIndication(liveIssues)

  const itemsByColumn = useMemo(() => {
    if (liveIssues === undefined) return null
    return assembleColumns({ liveIssues, leaving, enteringKeys, changedKeys, searchQuery })
  }, [liveIssues, leaving, enteringKeys, changedKeys, searchQuery])

  if (boardQuery.isPending) return { phase: 'loading' }
  if (boardQuery.isError && boardQuery.data === undefined) {
    const message = boardQuery.error instanceof Error ? boardQuery.error.message : 'unknown error'
    return { phase: 'error-hard', message: `Couldn't load board: ${message}` }
  }
  if (boardQuery.data === undefined || boardQuery.data.ok === false) {
    return { phase: 'unauthorized' }
  }
  if (boardQuery.data.issues.length === 0) return { phase: 'empty' }

  return {
    phase: 'ready',
    baseUrl: boardQuery.data.baseUrl,
    itemsByColumn: itemsByColumn!,
    showErrorBanner: boardQuery.isError,
    errorMessage: boardQuery.error instanceof Error ? boardQuery.error.message : undefined,
    retry: () => boardQuery.refetch(),
  }
}
