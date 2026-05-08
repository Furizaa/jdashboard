import type { BoardIssue } from '~/server/jira'
import type { ReviewCard, ReviewCardReal } from '~/server/gitlab'
import type { TicketCardAnimationState } from '~/features/ticket-card'
import { COLUMNS, columnForStatus, type Column } from './status-mapping'
import { filterIssues } from './filter-issues'
import { sortColumnIssues } from './sort-column'
import type { ChangeIndicationResult } from './use-change-indication'

export type CardSource = { kind: 'jira'; issue: BoardIssue } | { kind: 'review'; card: ReviewCard }

export type ColumnItem = {
  card: CardSource
  /** Stable id for animation/key purposes (Jira key for jira; review:<iid> for review cards). */
  id: string
  state: TicketCardAnimationState
}

function reviewBucketColumn(bucket: ReviewCard['bucket']): Column {
  if (bucket === 'accepted') return 'Done'
  return 'TO DO'
}

const REVIEW_BUCKET_STATUS_NAME: Record<ReviewCardReal['bucket'], string> = {
  'needs-review': 'Needs Review',
  rejected: 'Review Rejected',
  accepted: 'Review Accepted',
}

function statusNameForItem(item: ColumnItem): string {
  if (item.card.kind === 'jira') return item.card.issue.statusName
  return REVIEW_BUCKET_STATUS_NAME[item.card.card.bucket]
}

function reviewSearchHaystack(card: ReviewCard): string {
  if (card.kind === 'review-real') {
    return `${card.jira.key} ${card.jira.summary}`.toLowerCase()
  }
  return `MR !${card.iid} ${card.title}`.toLowerCase()
}

function matchesSearch(card: CardSource, query: string): boolean {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack =
    card.kind === 'jira'
      ? `${card.issue.key} ${card.issue.summary}`.toLowerCase()
      : reviewSearchHaystack(card.card)
  return terms.every((term) => haystack.includes(term))
}

function animationState(
  id: string,
  enteringKeys: ReadonlySet<string>,
  changedKeys: ReadonlySet<string>,
): TicketCardAnimationState {
  if (enteringKeys.has(id)) return 'entering'
  if (changedKeys.has(id)) return 'changed'
  return 'idle'
}

export function assembleColumns(input: {
  liveIssues: readonly BoardIssue[]
  jiraChange: ChangeIndicationResult<BoardIssue>
  reviewCards?: readonly ReviewCard[]
  reviewChange?: ChangeIndicationResult<ReviewCard>
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
      state: animationState(issue.key, jiraChange.enteringKeys, jiraChange.changedKeys),
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
      const id = `review:${rc.iid}`
      result[reviewBucketColumn(rc.bucket)].push({
        card: cardInput,
        id,
        state: animationState(id, entering, changed),
      })
    }
  }
  if (reviewChange !== undefined) {
    for (const leavingCard of reviewChange.leaving.values()) {
      const cardInput: CardSource = { kind: 'review', card: leavingCard }
      if (!matchesSearch(cardInput, searchQuery)) continue
      result[reviewBucketColumn(leavingCard.bucket)].push({
        card: cardInput,
        id: `review:${leavingCard.iid}`,
        state: 'leaving',
      })
    }
  }
  for (const column of COLUMNS) {
    const items = result[column]
    const sortables = items.map((item) => ({ id: item.id, statusName: statusNameForItem(item) }))
    const sorted = sortColumnIssues(sortables, column)
    const itemById = new Map(items.map((item) => [item.id, item]))
    result[column] = sorted.map((s) => itemById.get(s.id)!)
  }
  return result
}
