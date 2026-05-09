import { match, P } from 'ts-pattern'
import type { BoardIssue, Column, ReviewCard, SearchIssuesResult } from '~/kernel'
import { assembleColumns, EMPTY_VISUAL, type ChangeVisual, type ColumnItem } from '../domain'

export type State = {
  jira: ChangeVisual<BoardIssue>
  review: ChangeVisual<ReviewCard>
}

export const initialState: State = {
  jira: EMPTY_VISUAL<BoardIssue>(),
  review: EMPTY_VISUAL<ReviewCard>(),
}

type DiffPayload<T> = {
  entering: ReadonlySet<string>
  changed: ReadonlySet<string>
  leavingNow: ReadonlyMap<string, T>
  returning: ReadonlySet<string>
}

export type Event =
  | ({ type: 'jiraDiffApplied' } & DiffPayload<BoardIssue>)
  | ({ type: 'reviewDiffApplied' } & DiffPayload<ReviewCard>)
  | { type: 'jiraEnteringExpired'; keys: readonly string[] }
  | { type: 'jiraChangedExpired'; keys: readonly string[] }
  | { type: 'jiraLeavingExpired'; keys: readonly string[] }
  | { type: 'reviewEnteringExpired'; keys: readonly string[] }
  | { type: 'reviewChangedExpired'; keys: readonly string[] }
  | { type: 'reviewLeavingExpired'; keys: readonly string[] }

function unionAdd(set: ReadonlySet<string>, more: ReadonlySet<string>): ReadonlySet<string> {
  if (more.size === 0) return set
  const next = new Set(set)
  for (const k of more) next.add(k)
  return next
}

function setRemove(set: ReadonlySet<string>, keys: readonly string[]): ReadonlySet<string> {
  if (keys.length === 0) return set
  let next: Set<string> | null = null
  for (const k of keys) {
    if (set.has(k)) {
      if (next === null) next = new Set(set)
      next.delete(k)
    }
  }
  return next ?? set
}

function mapRemove<T>(
  map: ReadonlyMap<string, T>,
  keys: readonly string[],
): ReadonlyMap<string, T> {
  if (keys.length === 0) return map
  let next: Map<string, T> | null = null
  for (const k of keys) {
    if (map.has(k)) {
      if (next === null) next = new Map(map)
      next.delete(k)
    }
  }
  return next ?? map
}

function applyDiff<T>(visual: ChangeVisual<T>, diff: DiffPayload<T>): ChangeVisual<T> {
  const enteringKeys = unionAdd(visual.enteringKeys, diff.entering)
  const changedKeys = unionAdd(visual.changedKeys, diff.changed)
  let leaving: ReadonlyMap<string, T> = visual.leaving
  if (diff.returning.size > 0 || diff.leavingNow.size > 0) {
    const next = new Map(visual.leaving)
    for (const k of diff.returning) next.delete(k)
    for (const [k, v] of diff.leavingNow) next.set(k, v)
    leaving = next
  }
  if (
    enteringKeys === visual.enteringKeys &&
    changedKeys === visual.changedKeys &&
    leaving === visual.leaving
  ) {
    return visual
  }
  return { enteringKeys, changedKeys, leaving }
}

function expireEntering<T>(visual: ChangeVisual<T>, keys: readonly string[]): ChangeVisual<T> {
  const next = setRemove(visual.enteringKeys, keys)
  return next === visual.enteringKeys ? visual : { ...visual, enteringKeys: next }
}

function expireChanged<T>(visual: ChangeVisual<T>, keys: readonly string[]): ChangeVisual<T> {
  const next = setRemove(visual.changedKeys, keys)
  return next === visual.changedKeys ? visual : { ...visual, changedKeys: next }
}

function expireLeaving<T>(visual: ChangeVisual<T>, keys: readonly string[]): ChangeVisual<T> {
  const next = mapRemove(visual.leaving, keys)
  return next === visual.leaving ? visual : { ...visual, leaving: next }
}

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'jiraDiffApplied' }, (e) => {
      const next = applyDiff(state.jira, e)
      return next === state.jira ? state : { ...state, jira: next }
    })
    .with({ type: 'reviewDiffApplied' }, (e) => {
      const next = applyDiff(state.review, e)
      return next === state.review ? state : { ...state, review: next }
    })
    .with({ type: 'jiraEnteringExpired' }, (e) => {
      const next = expireEntering(state.jira, e.keys)
      return next === state.jira ? state : { ...state, jira: next }
    })
    .with({ type: 'jiraChangedExpired' }, (e) => {
      const next = expireChanged(state.jira, e.keys)
      return next === state.jira ? state : { ...state, jira: next }
    })
    .with({ type: 'jiraLeavingExpired' }, (e) => {
      const next = expireLeaving(state.jira, e.keys)
      return next === state.jira ? state : { ...state, jira: next }
    })
    .with({ type: 'reviewEnteringExpired' }, (e) => {
      const next = expireEntering(state.review, e.keys)
      return next === state.review ? state : { ...state, review: next }
    })
    .with({ type: 'reviewChangedExpired' }, (e) => {
      const next = expireChanged(state.review, e.keys)
      return next === state.review ? state : { ...state, review: next }
    })
    .with({ type: 'reviewLeavingExpired' }, (e) => {
      const next = expireLeaving(state.review, e.keys)
      return next === state.review ? state : { ...state, review: next }
    })
    .exhaustive()
}

type ReadyFields = {
  baseUrl: string
  itemsByColumn: Record<Column, ColumnItem[]>
  showErrorBanner: boolean
  errorMessage: string | undefined
  retry: () => void
}

export type DisplayState =
  | { phase: 'loading' }
  | { phase: 'error-hard'; message: string }
  | { phase: 'unauthorized' }
  | { phase: 'empty' }
  | (ReadyFields & { phase: 'ready' })

export type QueryData = {
  data: SearchIssuesResult | undefined
  isPending: boolean
  isError: boolean
  error: Error | undefined
}

export function derive(input: {
  state: State
  queryData: QueryData
  reviewCards: readonly ReviewCard[] | undefined
  searchQuery: string
  retry: () => void
}): DisplayState {
  const { state, queryData, reviewCards, searchQuery, retry } = input

  if (queryData.isPending) return { phase: 'loading' }
  if (queryData.isError && queryData.data === undefined) {
    const message = queryData.error?.message ?? 'unknown error'
    return { phase: 'error-hard', message: `Couldn't load board: ${message}` }
  }
  return match(queryData.data)
    .with(P.nullish, () => ({ phase: 'unauthorized' as const }))
    .with({ ok: false }, () => ({ phase: 'unauthorized' as const }))
    .with({ ok: true, issues: [] }, () => ({ phase: 'empty' as const }))
    .with({ ok: true }, (data) => ({
      phase: 'ready' as const,
      baseUrl: data.baseUrl,
      itemsByColumn: assembleColumns({
        liveIssues: data.issues,
        jiraChange: state.jira,
        reviewCards,
        reviewChange: state.review,
        searchQuery,
      }),
      showErrorBanner: queryData.isError,
      errorMessage: queryData.error?.message,
      retry,
    }))
    .exhaustive()
}
