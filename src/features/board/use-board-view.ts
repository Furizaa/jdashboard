import { useMemo } from 'react'
import type { UseQueryResult } from '@tanstack/react-query'
import { useBoardData, useMrStatuses, useReviewCards } from '~/coordinator'
import { usePolling } from '~/lib/use-polling'
import type { BoardIssue, SearchIssuesResult } from '~/server/jira'
import type { ReviewCard } from '~/server/gitlab'
import { useChangeIndication } from './use-change-indication'
import { assembleColumns, type ColumnItem } from './assemble-columns'
import type { Column } from './status-mapping'

export const BOARD_POLL_INTERVAL_MS = 60_000

export type BoardViewDeps = {
  boardQuery: UseQueryResult<SearchIssuesResult>
  /** Called once per render. Production wires `useMrStatuses` and `useReviewCards`; tests pass a no-op. */
  subscribeAuxiliary: () => { reviewCards: readonly ReviewCard[] | undefined }
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

function jiraFingerprint(issue: BoardIssue): string {
  const labels = issue.labels.toSorted().join('|')
  return `${issue.statusName}::${issue.summary}::${labels}`
}

const JIRA_CHANGE_OPTIONS = {
  id: (issue: BoardIssue) => issue.key,
  equals: (a: BoardIssue, b: BoardIssue) => jiraFingerprint(a) === jiraFingerprint(b),
}

const REVIEW_CHANGE_OPTIONS = {
  id: (card: ReviewCard) => `review:${card.iid}`,
  equals: (a: ReviewCard, b: ReviewCard) => a.bucket === b.bucket,
}

export function useBoardView(searchQuery: string): BoardViewState {
  const boardQuery = useBoardData()
  return useBoardViewWithDeps(searchQuery, {
    boardQuery,
    subscribeAuxiliary: () => {
      useMrStatuses()
      const review = useReviewCards()
      const reviewCards = review.data && review.data.ok === true ? review.data.cards : undefined
      return { reviewCards }
    },
  })
}

export function useBoardViewWithDeps(searchQuery: string, deps: BoardViewDeps): BoardViewState {
  const { boardQuery } = deps
  const { reviewCards } = deps.subscribeAuxiliary()
  usePolling(() => {
    boardQuery.refetch()
  }, BOARD_POLL_INTERVAL_MS)

  const liveIssues = boardQuery.data?.ok === true ? boardQuery.data.issues : undefined
  const jiraChange = useChangeIndication(liveIssues, JIRA_CHANGE_OPTIONS)
  const reviewChange = useChangeIndication(reviewCards, REVIEW_CHANGE_OPTIONS)

  const itemsByColumn = useMemo(() => {
    if (liveIssues === undefined) return null
    return assembleColumns({
      liveIssues,
      jiraChange,
      reviewCards,
      reviewChange,
      searchQuery,
    })
  }, [liveIssues, jiraChange, reviewCards, reviewChange, searchQuery])

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
