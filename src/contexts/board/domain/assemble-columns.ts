import { match } from 'ts-pattern'
import type { BoardIssue, Column, ReviewCard } from '~/kernel'
import {
  COLUMNS,
  columnForStatus,
  REVIEW_BUCKET_STATUS_NAME,
  reviewBucketColumn,
  reviewCardId,
  reviewSearchHaystack,
} from '~/kernel'
import type { AnimationState } from './animation-state'
import type { ChangeVisual } from './change-indication'
import { filterIssues } from './filter-issues'
import { sortColumnIssues } from './sort-column'

export type CardSource = { kind: 'jira'; issue: BoardIssue } | { kind: 'review'; card: ReviewCard }

export type ColumnItem = {
  card: CardSource
  /** Stable id for animation/key purposes (Jira key for jira; review:<iid> for review cards). */
  id: string
  state: AnimationState
}

function statusNameForItem(item: ColumnItem): string {
  return match(item.card)
    .with({ kind: 'jira' }, ({ issue }) => issue.statusName)
    .with({ kind: 'review' }, ({ card }) => REVIEW_BUCKET_STATUS_NAME[card.bucket])
    .exhaustive()
}

function matchesSearch(card: CardSource, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = match(card)
    .with({ kind: 'jira' }, ({ issue }) => `${issue.key} ${issue.summary}`.toLowerCase())
    .with({ kind: 'review' }, ({ card: rc }) => reviewSearchHaystack(rc))
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

export function assembleColumns(input: {
  liveIssues: readonly BoardIssue[]
  jiraChange: ChangeVisual<BoardIssue>
  reviewCards?: readonly ReviewCard[]
  reviewChange?: ChangeVisual<ReviewCard>
  searchQuery: string
}): Record<Column, ColumnItem[]> {
  const { liveIssues, jiraChange, reviewCards, reviewChange, searchQuery } = input
  const result: Record<Column, ColumnItem[]> = {
    'TO DO': [],
    'In Implementation': [],
    'In Code Review': [],
    Done: [],
  }
  for (const issue of filterIssues(liveIssues, searchQuery)) {
    result[columnForStatus(issue.statusName)].push({
      card: { kind: 'jira', issue },
      id: issue.key,
      state: animationStateOf(issue.key, jiraChange.enteringKeys, jiraChange.changedKeys),
    })
  }
  for (const leavingIssue of filterIssues([...jiraChange.leaving.values()], searchQuery)) {
    result[columnForStatus(leavingIssue.statusName)].push({
      card: { kind: 'jira', issue: leavingIssue },
      id: leavingIssue.key,
      state: 'leaving',
    })
  }
  if (reviewCards !== undefined) {
    const entering = reviewChange?.enteringKeys ?? new Set<string>()
    const changed = reviewChange?.changedKeys ?? new Set<string>()
    for (const rc of reviewCards) {
      const cardInput: CardSource = { kind: 'review', card: rc }
      if (!matchesSearch(cardInput, searchQuery)) continue
      const id = reviewCardId(rc)
      result[reviewBucketColumn(rc.bucket)].push({
        card: cardInput,
        id,
        state: animationStateOf(id, entering, changed),
      })
    }
  }
  if (reviewChange !== undefined) {
    for (const leavingCard of reviewChange.leaving.values()) {
      const cardInput: CardSource = { kind: 'review', card: leavingCard }
      if (!matchesSearch(cardInput, searchQuery)) continue
      result[reviewBucketColumn(leavingCard.bucket)].push({
        card: cardInput,
        id: reviewCardId(leavingCard),
        state: 'leaving',
      })
    }
  }
  for (const column of COLUMNS) {
    const items = result[column]
    const sortables = items.map((item) => ({ id: item.id, statusName: statusNameForItem(item) }))
    const sorted = sortColumnIssues(sortables, column)
    const itemById = new Map(items.map((item) => [item.id, item]))
    result[column] = sorted.map((s) => {
      const item = itemById.get(s.id)
      if (item === undefined) throw new Error(`assembleColumns: missing item for id ${s.id}`)
      return item
    })
  }
  return result
}
