import { useEffect, useReducer, useRef } from 'react'
import { useBoardData, useMrStatuses } from '~/coordinator'
import { reviewCardId, useReviewCards } from '~/contexts/review'
import { usePolling } from '~/lib/use-polling'
import type { BoardIssue, ReviewCard } from '~/kernel'
import { diffChange, indexBy, type ChangeOptions } from '../domain'
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
    if (
      prevJiraRef.current === current &&
      diff.entering.size === 0 &&
      diff.changed.size === 0 &&
      diff.leavingNow.size === 0 &&
      diff.returning.size === 0
    ) {
      return
    }
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
    if (
      diff.entering.size === 0 &&
      diff.changed.size === 0 &&
      diff.leavingNow.size === 0 &&
      diff.returning.size === 0
    ) {
      return
    }
    dispatch({
      type: 'reviewDiffApplied',
      entering: diff.entering,
      changed: diff.changed,
      leavingNow: diff.leavingNow,
      returning: diff.returning,
    })
  }, [reviewCards])

  useEffect(() => {
    if (state.jira.enteringKeys.size === 0) return
    const keys = [...state.jira.enteringKeys]
    const t = setTimeout(() => dispatch({ type: 'jiraEnteringExpired', keys }), BOARD_FADE_MS)
    return () => clearTimeout(t)
  }, [state.jira.enteringKeys])

  useEffect(() => {
    if (state.jira.changedKeys.size === 0) return
    const keys = [...state.jira.changedKeys]
    const t = setTimeout(() => dispatch({ type: 'jiraChangedExpired', keys }), BOARD_PULSE_MS)
    return () => clearTimeout(t)
  }, [state.jira.changedKeys])

  useEffect(() => {
    if (state.jira.leaving.size === 0) return
    const keys = [...state.jira.leaving.keys()]
    const t = setTimeout(() => dispatch({ type: 'jiraLeavingExpired', keys }), BOARD_FADE_MS)
    return () => clearTimeout(t)
  }, [state.jira.leaving])

  useEffect(() => {
    if (state.review.enteringKeys.size === 0) return
    const keys = [...state.review.enteringKeys]
    const t = setTimeout(() => dispatch({ type: 'reviewEnteringExpired', keys }), BOARD_FADE_MS)
    return () => clearTimeout(t)
  }, [state.review.enteringKeys])

  useEffect(() => {
    if (state.review.changedKeys.size === 0) return
    const keys = [...state.review.changedKeys]
    const t = setTimeout(() => dispatch({ type: 'reviewChangedExpired', keys }), BOARD_PULSE_MS)
    return () => clearTimeout(t)
  }, [state.review.changedKeys])

  useEffect(() => {
    if (state.review.leaving.size === 0) return
    const keys = [...state.review.leaving.keys()]
    const t = setTimeout(() => dispatch({ type: 'reviewLeavingExpired', keys }), BOARD_FADE_MS)
    return () => clearTimeout(t)
  }, [state.review.leaving])

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
