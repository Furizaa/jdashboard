import { match } from 'ts-pattern'
import type { BoardIssue, Column, ReviewCard } from '~/kernel'
import {
  COLUMNS,
  columnForStatus,
  REVIEW_BUCKET_STATUS_NAME,
  reviewBucketColumn,
  reviewCardId,
  reviewSearchHaystack,
  watchlistCardId,
} from '~/kernel'
import type { AnimationState } from './animation-state'
import type { ChangeVisual } from './change-indication'
import { filterIssues } from './filter-issues'
import { sortColumnIssues } from './sort-column'

export type CardSource =
  | { kind: 'jira'; issue: BoardIssue }
  | { kind: 'review'; card: ReviewCard }
  | { kind: 'watchlist'; issue: BoardIssue }

/** Which group inside a lane a card belongs to. Watchlist cards render in a
 * dedicated sub-section of the In Implementation lane; everything else is main. */
export type ColumnSection = 'main' | 'watchlist'

// Watchlist cards always live in the In Implementation lane's sub-section,
// regardless of their real Jira status.
const WATCHLIST_COLUMN: Column = 'In Implementation'

export type ColumnItem = {
  card: CardSource
  /** Stable id for animation/key purposes (Jira key for jira; review:<iid> for review; watchlist:<key>). */
  id: string
  state: AnimationState
  section: ColumnSection
}

function statusNameForItem(item: ColumnItem): string {
  return match(item.card)
    .with({ kind: 'jira' }, ({ issue }) => issue.statusName)
    .with({ kind: 'review' }, ({ card }) => REVIEW_BUCKET_STATUS_NAME[card.bucket])
    .with({ kind: 'watchlist' }, ({ issue }) => issue.statusName)
    .exhaustive()
}

// The ticket key a card would open in the detail panel: the Jira key for jira
// and review-real cards, null for review-fake (MR-only, no ticket). Kept in
// lockstep with the card's "workspace open" tint, so the "Only Workspace"
// filter shows exactly the cards that carry the blue indicator.
function panelIssueKey(card: CardSource): string | null {
  return match(card)
    .with({ kind: 'jira' }, ({ issue }) => issue.key)
    .with({ kind: 'review' }, ({ card: rc }) => (rc.kind === 'review-real' ? rc.jira.key : null))
    .with({ kind: 'watchlist' }, ({ issue }) => issue.key)
    .exhaustive()
}

export type WorkspaceFilter = { onlyWorkspace: boolean; openKeys: ReadonlySet<string> }

const NO_WORKSPACE_FILTER: WorkspaceFilter = { onlyWorkspace: false, openKeys: new Set() }

function matchesWorkspace(card: CardSource, filter: WorkspaceFilter): boolean {
  if (!filter.onlyWorkspace) return true
  const key = panelIssueKey(card)
  return key !== null && filter.openKeys.has(key)
}

function matchesSearch(card: CardSource, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = match(card)
    .with({ kind: 'jira' }, ({ issue }) => `${issue.key} ${issue.summary}`.toLowerCase())
    .with({ kind: 'review' }, ({ card: rc }) => reviewSearchHaystack(rc))
    .with({ kind: 'watchlist' }, ({ issue }) => `${issue.key} ${issue.summary}`.toLowerCase())
    .exhaustive()
  return terms.every((term) => haystack.includes(term))
}

function animationStateOf(
  id: string,
  enteringKeys: ReadonlySet<string>,
  changedKeys: ReadonlySet<string>,
): AnimationState {
  if (enteringKeys.has(id)) return 'entering'
  if (changedKeys.has(id)) return 'changed'
  return 'idle'
}

function emptyResult(): Record<Column, ColumnItem[]> {
  return { 'TO DO': [], 'In Implementation': [], 'In Code Review': [], Done: [] }
}

function placeJiraIssues(
  result: Record<Column, ColumnItem[]>,
  liveIssues: readonly BoardIssue[],
  jiraChange: ChangeVisual<BoardIssue>,
  searchQuery: string,
  workspaceFilter: WorkspaceFilter,
): void {
  for (const issue of filterIssues(liveIssues, searchQuery)) {
    if (!matchesWorkspace({ kind: 'jira', issue }, workspaceFilter)) continue
    result[columnForStatus(issue.statusName)].push({
      card: { kind: 'jira', issue },
      id: issue.key,
      state: animationStateOf(issue.key, jiraChange.enteringKeys, jiraChange.changedKeys),
      section: 'main',
    })
  }
  for (const leavingIssue of filterIssues([...jiraChange.leaving.values()], searchQuery)) {
    if (!matchesWorkspace({ kind: 'jira', issue: leavingIssue }, workspaceFilter)) continue
    result[columnForStatus(leavingIssue.statusName)].push({
      card: { kind: 'jira', issue: leavingIssue },
      id: leavingIssue.key,
      state: 'leaving',
      section: 'main',
    })
  }
}

// Tickets whose real status is In Implementation float to the top of the
// sub-section (the ones actively being worked); the rest keep their incoming
// order (JQL `updated DESC`). Stable partition.
function orderWatchlistCards(cards: readonly BoardIssue[]): readonly BoardIssue[] {
  const inImplementation: BoardIssue[] = []
  const rest: BoardIssue[] = []
  for (const issue of cards) {
    if (columnForStatus(issue.statusName) === 'In Implementation') inImplementation.push(issue)
    else rest.push(issue)
  }
  return [...inImplementation, ...rest]
}

// Watchlist cards: pinned into the In Implementation lane's sub-section regardless
// of real status, filtered by the same search/workspace rules as review cards.
// A key already present as a board jira issue is skipped so no card renders twice.
function placeWatchlistCards(
  result: Record<Column, ColumnItem[]>,
  watchlistCards: readonly BoardIssue[] | undefined,
  searchQuery: string,
  workspaceFilter: WorkspaceFilter,
  existingJiraKeys: ReadonlySet<string>,
): void {
  for (const issue of orderWatchlistCards(watchlistCards ?? [])) {
    if (existingJiraKeys.has(issue.key)) continue
    const cardInput: CardSource = { kind: 'watchlist', issue }
    if (!matchesSearch(cardInput, searchQuery)) continue
    if (!matchesWorkspace(cardInput, workspaceFilter)) continue
    result[WATCHLIST_COLUMN].push({
      card: cardInput,
      id: watchlistCardId(issue),
      state: 'idle',
      section: 'watchlist',
    })
  }
}

function pushReviewCard(
  result: Record<Column, ColumnItem[]>,
  card: ReviewCard,
  state: AnimationState,
  searchQuery: string,
  workspaceFilter: WorkspaceFilter,
): void {
  const cardInput: CardSource = { kind: 'review', card }
  if (!matchesSearch(cardInput, searchQuery)) return
  if (!matchesWorkspace(cardInput, workspaceFilter)) return
  result[reviewBucketColumn(card.bucket)].push({
    card: cardInput,
    id: reviewCardId(card),
    state,
    section: 'main',
  })
}

function placeReviewCards(
  result: Record<Column, ColumnItem[]>,
  reviewCards: readonly ReviewCard[] | undefined,
  reviewChange: ChangeVisual<ReviewCard> | undefined,
  searchQuery: string,
  workspaceFilter: WorkspaceFilter,
): void {
  const entering = reviewChange?.enteringKeys ?? new Set<string>()
  const changed = reviewChange?.changedKeys ?? new Set<string>()
  for (const rc of reviewCards ?? []) {
    pushReviewCard(
      result,
      rc,
      animationStateOf(reviewCardId(rc), entering, changed),
      searchQuery,
      workspaceFilter,
    )
  }
  for (const leavingCard of reviewChange?.leaving.values() ?? []) {
    pushReviewCard(result, leavingCard, 'leaving', searchQuery, workspaceFilter)
  }
}

function sortColumn(items: ColumnItem[], column: Column): ColumnItem[] {
  const sortables = items.map((item) => ({ id: item.id, statusName: statusNameForItem(item) }))
  const sorted = sortColumnIssues(sortables, column)
  const itemById = new Map(items.map((item) => [item.id, item]))
  return sorted.map((s) => {
    const item = itemById.get(s.id)
    if (item === undefined) throw new Error(`assembleColumns: missing item for id ${s.id}`)
    return item
  })
}

export function assembleColumns(input: {
  liveIssues: readonly BoardIssue[]
  jiraChange: ChangeVisual<BoardIssue>
  reviewCards?: readonly ReviewCard[]
  reviewChange?: ChangeVisual<ReviewCard>
  watchlistCards?: readonly BoardIssue[]
  searchQuery: string
  workspaceFilter?: WorkspaceFilter
}): Record<Column, ColumnItem[]> {
  const { liveIssues, jiraChange, reviewCards, reviewChange, watchlistCards, searchQuery } = input
  const workspaceFilter = input.workspaceFilter ?? NO_WORKSPACE_FILTER
  const result = emptyResult()
  placeJiraIssues(result, liveIssues, jiraChange, searchQuery, workspaceFilter)
  placeReviewCards(result, reviewCards, reviewChange, searchQuery, workspaceFilter)
  const existingJiraKeys = new Set(liveIssues.map((i) => i.key))
  placeWatchlistCards(result, watchlistCards, searchQuery, workspaceFilter, existingJiraKeys)
  for (const column of COLUMNS) {
    result[column] = sortColumn(result[column], column)
  }
  return result
}
