import type { QueryClient } from '@tanstack/react-query'
import type { GetMrStatusesResult, SearchIssuesResult } from '~/server/server-functions/board'
import {
  getTransitions,
  type GetIssueResult,
  type GetTransitionsResult,
} from '~/server/server-functions/detail'
import type { GetReviewCardsResult } from '~/server/server-functions/review'
import type { Cache, Patch, Rollback } from '../ports'

const KEY_BOARD = ['jira', 'board', 'issues'] as const
const KEY_ISSUE = (k: string) => ['jira', 'issue', k] as const
const KEY_ISSUE_PREFIX = ['jira', 'issue'] as const
const KEY_TRANSITIONS = (k: string) => ['jira', 'transitions', k] as const
const KEY_MR = ['mr-statuses'] as const
const KEY_REVIEW_CARDS = ['review-cards'] as const
const KEY_WORKSPACES = ['workspaces'] as const
const KEY_WATCHLIST = ['watchlist'] as const
const KEY_WATCHLIST_LANES = ['watchlist-lanes'] as const
const KEY_TAGS = ['tags'] as const
const KEY_NOTE = (k: string) => ['notes', k] as const
// Distinct from KEY_NOTE (not `['notes']`) so invalidating the has-note set does
// not prefix-match and blow away every open note's query.
const KEY_NOTE_KEYS = ['note-keys'] as const
// The automated changelog beside a note; own prefix, not under `['notes']`.
const KEY_CHANGELOG = (k: string) => ['note-changelog', k] as const
// The open Explain tabs. One query for the whole set — the strip, every tab's
// phase, and each MR's current head all come from it.
const KEY_EXPLAIN_TABS = ['explain-tabs'] as const
// One merge request's whole diff, read on demand by a move page's expander
// (ADR-0010 §6). Keyed per MR and shared by every move in that report, since the
// moves are slices of the same file list.
const KEY_EXPLAIN_DIFFS = (iid: number) => ['explain-diffs', iid] as const

export const DASHBOARD_QUERY_KEYS = {
  board: KEY_BOARD,
  issue: KEY_ISSUE,
  transitions: KEY_TRANSITIONS,
  mrStatuses: KEY_MR,
  reviewCards: KEY_REVIEW_CARDS,
  workspaces: KEY_WORKSPACES,
  watchlist: KEY_WATCHLIST,
  watchlistLanes: KEY_WATCHLIST_LANES,
  tags: KEY_TAGS,
  note: KEY_NOTE,
  noteKeys: KEY_NOTE_KEYS,
  changelog: KEY_CHANGELOG,
  explainTabs: KEY_EXPLAIN_TABS,
  explainDiffs: KEY_EXPLAIN_DIFFS,
} as const

export const DASHBOARD_STALE_TIMES = {
  board: 30_000,
  issue: 30_000,
  transitions: 0,
  mrStatuses: 30_000,
  reviewCards: 30_000,
  workspaces: 15_000,
  watchlist: 30_000,
  watchlistLanes: 30_000,
  tags: 30_000,
  note: 30_000,
  noteKeys: 30_000,
  changelog: 30_000,
  myself: 60_000,
  // Short: the set changes on start and on close, and each read also refreshes
  // every tab's current head SHA for the stale-report warning. Live progress
  // comes over SSE, not from this query, so it does not need to be shorter.
  explainTabs: 10_000,
  // Long: a merge request's diff only changes when someone pushes, and the
  // expander names the commit it is showing — so a stale read is visible rather
  // than misleading. The fetch is also only ever triggered by a click.
  explainDiffs: 120_000,
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
