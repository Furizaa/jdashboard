import { useEffect, useReducer, useRef } from 'react'
import { useBoardData, useMrStatuses, useReviewCards } from '~/coordinator'
import { usePolling } from '~/lib/use-polling'
import type { BoardIssue, ReviewCard } from '~/kernel'
import { reviewCardId } from '~/kernel'
import { diffChange, indexBy, isEmptyDiff, type ChangeOptions } from '../domain'
import { derive, initialState, reduce, type DisplayState } from '../view-model/board-view-model'

export const BOARD_POLL_INTERVAL_MS = 60_000
const BOARD_FADE_MS = 300
const BOARD_PULSE_MS = 600

function jiraFingerprint(issue: BoardIssue): string {
  const labels = issue.labels.toSorted().join('|')
  return `${issue.statusName}::${issue.summary}::${labels}`
}

const JIRA_OPTIONS: ChangeOptions<BoardIssue> = {
  id: (i) => i.key,
  equals: (a, b) => jiraFingerprint(a) === jiraFingerprint(b),
}

const REVIEW_OPTIONS: ChangeOptions<ReviewCard> = {
  id: (c) => reviewCardId(c),
  equals: (a, b) => a.bucket === b.bucket,
}

function useExpiringKeys(
  source: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  delayMs: number,
  onExpire: (keys: string[]) => void,
): void {
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire
  useEffect(() => {
    if (source.size === 0) return
    const keys = [...source.keys()]
    const t = setTimeout(() => onExpireRef.current(keys), delayMs)
    return () => clearTimeout(t)
  }, [source, delayMs])
}

export function useBoardView(searchQuery: string): DisplayState {
  const boardQuery = useBoardData()
  useMrStatuses()
  const reviewQuery = useReviewCards()
  const reviewCards =
    reviewQuery.data && reviewQuery.data.ok === true ? reviewQuery.data.cards : undefined

  usePolling(() => {
    boardQuery.refetch()
  }, BOARD_POLL_INTERVAL_MS)

  const [state, dispatch] = useReducer(reduce, initialState)

  const liveIssues = boardQuery.data?.ok === true ? boardQuery.data.issues : undefined

  const prevJiraRef = useRef<ReadonlyMap<string, BoardIssue> | null>(null)
  const prevReviewRef = useRef<ReadonlyMap<string, ReviewCard> | null>(null)
  const jiraLeavingRef = useRef(state.jira.leaving)
  jiraLeavingRef.current = state.jira.leaving
  const reviewLeavingRef = useRef(state.review.leaving)
  reviewLeavingRef.current = state.review.leaving

  useEffect(() => {
    if (liveIssues === undefined) return
    const current = indexBy(liveIssues, JIRA_OPTIONS.id)
    const diff = diffChange(prevJiraRef.current, current, JIRA_OPTIONS, jiraLeavingRef.current)
    prevJiraRef.current = current
    if (isEmptyDiff(diff)) return
    dispatch({
      type: 'jiraDiffApplied',
      entering: diff.entering,
      changed: diff.changed,
      leavingNow: diff.leavingNow,
      returning: diff.returning,
    })
  }, [liveIssues])

  useEffect(() => {
    if (reviewCards === undefined) return
    const current = indexBy(reviewCards, REVIEW_OPTIONS.id)
    const diff = diffChange(
      prevReviewRef.current,
      current,
      REVIEW_OPTIONS,
      reviewLeavingRef.current,
    )
    prevReviewRef.current = current
    if (isEmptyDiff(diff)) return
    dispatch({
      type: 'reviewDiffApplied',
      entering: diff.entering,
      changed: diff.changed,
      leavingNow: diff.leavingNow,
      returning: diff.returning,
    })
  }, [reviewCards])

  useExpiringKeys(state.jira.enteringKeys, BOARD_FADE_MS, (keys) =>
    dispatch({ type: 'jiraEnteringExpired', keys }),
  )
  useExpiringKeys(state.jira.changedKeys, BOARD_PULSE_MS, (keys) =>
    dispatch({ type: 'jiraChangedExpired', keys }),
  )
  useExpiringKeys(state.jira.leaving, BOARD_FADE_MS, (keys) =>
    dispatch({ type: 'jiraLeavingExpired', keys }),
  )
  useExpiringKeys(state.review.enteringKeys, BOARD_FADE_MS, (keys) =>
    dispatch({ type: 'reviewEnteringExpired', keys }),
  )
  useExpiringKeys(state.review.changedKeys, BOARD_PULSE_MS, (keys) =>
    dispatch({ type: 'reviewChangedExpired', keys }),
  )
  useExpiringKeys(state.review.leaving, BOARD_FADE_MS, (keys) =>
    dispatch({ type: 'reviewLeavingExpired', keys }),
  )

  return derive({
    state,
    queryData: {
      data: boardQuery.data,
      isPending: boardQuery.isPending,
      isError: boardQuery.isError,
      error: boardQuery.error instanceof Error ? boardQuery.error : undefined,
    },
    reviewCards,
    searchQuery,
    retry: () => {
      boardQuery.refetch()
    },
  })
}
