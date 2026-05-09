import type { QueryClient } from '@tanstack/react-query'
import {
  getTransitions,
  type GetIssueResult,
  type GetTransitionsResult,
  type SearchIssuesResult,
} from '~/server/jira'
import type { GetMrStatusesResult, GetReviewCardsResult } from '~/server/gitlab'
import type { Cache, Patch, Rollback } from '../ports'

const KEY_BOARD = ['jira', 'board', 'issues'] as const
const KEY_ISSUE = (k: string) => ['jira', 'issue', k] as const
const KEY_ISSUE_PREFIX = ['jira', 'issue'] as const
const KEY_TRANSITIONS = (k: string) => ['jira', 'transitions', k] as const
const KEY_MR = ['mr-statuses'] as const
const KEY_REVIEW_CARDS = ['review-cards'] as const

export const DASHBOARD_QUERY_KEYS = {
  board: KEY_BOARD,
  issue: KEY_ISSUE,
  transitions: KEY_TRANSITIONS,
  mrStatuses: KEY_MR,
  reviewCards: KEY_REVIEW_CARDS,
} as const

export const DASHBOARD_STALE_TIMES = {
  board: 30_000,
  issue: 30_000,
  transitions: 0,
  mrStatuses: 30_000,
  reviewCards: 30_000,
  myself: 60_000,
} as const

export function createTanstackCacheAdapter(queryClient: QueryClient): Cache {
  function patch<T>(key: readonly unknown[], fn: Patch<T>): Rollback {
    const prev = queryClient.getQueryData<T>(key)
    const next = fn(prev)
    queryClient.setQueryData<T>(key, next)
    return () => {
      queryClient.setQueryData<T>(key, prev)
    }
  }

  return {
    readBoard: () => queryClient.getQueryData<SearchIssuesResult>(KEY_BOARD),
    readIssue: (key) => queryClient.getQueryData<GetIssueResult>(KEY_ISSUE(key)),
    readTransitions: (key) => queryClient.getQueryData<GetTransitionsResult>(KEY_TRANSITIONS(key)),
    readMrStatuses: () => queryClient.getQueryData<GetMrStatusesResult>(KEY_MR),
    readReviewCards: () => queryClient.getQueryData<GetReviewCardsResult>(KEY_REVIEW_CARDS),

    fetchTransitions: (key) =>
      queryClient.fetchQuery({
        queryKey: KEY_TRANSITIONS(key),
        queryFn: () => getTransitions({ data: { key } }),
      }),

    patchBoard: (fn) => patch<SearchIssuesResult>(KEY_BOARD, fn),
    patchIssue: (key, fn) => patch<GetIssueResult>(KEY_ISSUE(key), fn),

    cancelBoard: () => queryClient.cancelQueries({ queryKey: KEY_BOARD }),
    cancelIssue: (key) => queryClient.cancelQueries({ queryKey: KEY_ISSUE(key) }),

    invalidateBoard: () => {
      queryClient.invalidateQueries({ queryKey: KEY_BOARD })
    },
    invalidateIssue: (key) => {
      queryClient.invalidateQueries({ queryKey: KEY_ISSUE(key) })
    },
    invalidateAllIssues: () => {
      queryClient.invalidateQueries({ queryKey: KEY_ISSUE_PREFIX })
    },
    invalidateTransitions: (key) => {
      queryClient.invalidateQueries({ queryKey: KEY_TRANSITIONS(key) })
    },
    invalidateMrStatuses: () => {
      queryClient.invalidateQueries({ queryKey: KEY_MR })
    },
    invalidateReviewCards: () => {
      queryClient.invalidateQueries({ queryKey: KEY_REVIEW_CARDS })
    },
  }
}
