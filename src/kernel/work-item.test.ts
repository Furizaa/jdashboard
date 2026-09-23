import { describe, expect, it } from 'vitest'
import type { ReviewCardFake, ReviewCardReal } from './gitlab'
import type { BoardIssue } from './jira'
import {
  dedupeWorkItems,
  workItemHaystack,
  workItemId,
  workItemJiraKey,
  workItemTitle,
  type WorkItem,
} from './work-item'

function issue(overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key: 'HDR-101',
    summary: 'Trajectory minimap',
    statusName: 'In Implementation',
    typeName: 'Story',
    labels: [],
    epic: null,
    ...overrides,
  }
}

function realCard(overrides: Partial<ReviewCardReal> = {}): ReviewCardReal {
  return {
    kind: 'review-real',
    iid: 42,
    webUrl: 'https://gitlab.example/mr/42',
    title: 'HDR-101: minimap',
    bucket: 'needs-review',
    mrState: 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    priority: null,
    jira: {
      key: 'HDR-101',
      summary: 'Trajectory minimap',
      typeName: 'Story',
      labels: [],
      epic: null,
    },
    ...overrides,
  }
}

function fakeCard(overrides: Partial<ReviewCardFake> = {}): ReviewCardFake {
  return {
    kind: 'review-fake',
    iid: 77,
    webUrl: 'https://gitlab.example/mr/77',
    title: 'Bump deps',
    bucket: 'needs-review',
    mrState: 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    priority: null,
    jiraKeyAttempted: null,
    ...overrides,
  }
}

describe('workItemId', () => {
  it('identifies a board issue by its bare key', () => {
    expect(workItemId({ kind: 'jira', issue: issue() })).toBe('HDR-101')
  })

  it('prefixes a watchlist card so it never collides with the same key as a board card', () => {
    expect(workItemId({ kind: 'watchlist', issue: issue() })).toBe('watchlist:HDR-101')
  })

  it('reuses reviewCardId for review cards rather than a second scheme', () => {
    expect(workItemId({ kind: 'review-real', card: realCard() })).toBe('review:42')
    expect(workItemId({ kind: 'review-fake', card: fakeCard() })).toBe('review:77')
  })
})

describe('workItemJiraKey', () => {
  it('reads the key off every Jira-backed source', () => {
    expect(workItemJiraKey({ kind: 'jira', issue: issue() })).toBe('HDR-101')
    expect(workItemJiraKey({ kind: 'watchlist', issue: issue() })).toBe('HDR-101')
    expect(workItemJiraKey({ kind: 'review-real', card: realCard() })).toBe('HDR-101')
  })

  it('is null for a fake review card — an MR with no resolvable ticket', () => {
    expect(workItemJiraKey({ kind: 'review-fake', card: fakeCard() })).toBeNull()
  })
})

describe('workItemTitle', () => {
  it('is the ticket summary for Jira-backed items and the MR title for a fake card', () => {
    expect(workItemTitle({ kind: 'jira', issue: issue() })).toBe('Trajectory minimap')
    expect(workItemTitle({ kind: 'review-real', card: realCard() })).toBe('Trajectory minimap')
    expect(workItemTitle({ kind: 'review-fake', card: fakeCard() })).toBe('Bump deps')
  })
})

describe('workItemHaystack', () => {
  it('uses the key-then-summary shape the board filter already searches', () => {
    expect(workItemHaystack({ kind: 'jira', issue: issue() })).toBe('hdr-101 trajectory minimap')
    expect(workItemHaystack({ kind: 'watchlist', issue: issue() })).toBe(
      'hdr-101 trajectory minimap',
    )
  })

  it('delegates to reviewSearchHaystack for review cards', () => {
    expect(workItemHaystack({ kind: 'review-real', card: realCard() })).toBe(
      'hdr-101 trajectory minimap',
    )
    expect(workItemHaystack({ kind: 'review-fake', card: fakeCard() })).toBe('mr !77 bump deps')
  })
})

describe('dedupeWorkItems', () => {
  it('keeps the assigned board issue when the same ticket is also on the watchlist', () => {
    const items: readonly WorkItem[] = [
      { kind: 'watchlist', issue: issue() },
      { kind: 'jira', issue: issue() },
    ]
    const deduped = dedupeWorkItems(items)
    expect(deduped).toHaveLength(1)
    expect(deduped[0]?.kind).toBe('jira')
  })

  it('keeps the assigned board issue over a review-real card carrying the same key', () => {
    const items: readonly WorkItem[] = [
      { kind: 'review-real', card: realCard() },
      { kind: 'jira', issue: issue() },
    ]
    const deduped = dedupeWorkItems(items)
    expect(deduped).toHaveLength(1)
    expect(deduped[0]?.kind).toBe('jira')
  })

  it('keeps the watchlist card over a review-real card when the ticket is not assigned', () => {
    const items: readonly WorkItem[] = [
      { kind: 'review-real', card: realCard() },
      { kind: 'watchlist', issue: issue() },
    ]
    expect(dedupeWorkItems(items)[0]?.kind).toBe('watchlist')
  })

  it('collapses three sources of one ticket to a single item', () => {
    const items: readonly WorkItem[] = [
      { kind: 'jira', issue: issue() },
      { kind: 'watchlist', issue: issue() },
      { kind: 'review-real', card: realCard() },
    ]
    expect(dedupeWorkItems(items)).toHaveLength(1)
  })

  it('keeps distinct tickets and every fake card, which can never collide by key', () => {
    const items: readonly WorkItem[] = [
      { kind: 'jira', issue: issue() },
      { kind: 'jira', issue: issue({ key: 'HDR-202', summary: 'Other' }) },
      { kind: 'review-fake', card: fakeCard() },
      { kind: 'review-fake', card: fakeCard({ iid: 78 }) },
    ]
    expect(dedupeWorkItems(items)).toHaveLength(4)
  })

  it('preserves first-seen order and is a no-op on an empty list', () => {
    expect(dedupeWorkItems([])).toEqual([])
    const items: readonly WorkItem[] = [
      { kind: 'jira', issue: issue({ key: 'HDR-1' }) },
      { kind: 'jira', issue: issue({ key: 'HDR-2' }) },
    ]
    expect(dedupeWorkItems(items).map(workItemId)).toEqual(['HDR-1', 'HDR-2'])
  })
})
