import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import type { ReviewCardReal } from '~/server/gitlab'
import { assembleColumns, type ColumnItem } from './assemble-columns'
import type { LeavingIssue } from './use-change-indication'

function issue(key: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key,
    summary: key,
    statusName: 'Reviewed',
    typeName: 'Task',
    labels: [],
    epic: null,
    ...overrides,
  }
}

function leavingIssue(
  key: string,
  column: LeavingIssue['column'],
  overrides: Partial<BoardIssue> = {},
): LeavingIssue {
  return { ...issue(key, overrides), column }
}

const NO_LEAVING: ReadonlyMap<string, LeavingIssue> = new Map()
const NO_KEYS: ReadonlySet<string> = new Set()

function jiraKeyOf(item: ColumnItem): string {
  if (item.card.kind !== 'jira') throw new Error('expected jira card')
  return item.card.issue.key
}

function reviewCard(
  iid: number,
  bucket: ReviewCardReal['bucket'],
  jiraKey: string,
  overrides: Partial<ReviewCardReal['jira']> = {},
): ReviewCardReal {
  return {
    kind: 'review-real',
    iid,
    webUrl: `https://gitlab/p/-/merge_requests/${iid}`,
    title: `${jiraKey}: title`,
    bucket,
    mrState: bucket === 'accepted' ? 'merged' : 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    jira: {
      key: jiraKey,
      summary: `summary for ${jiraKey}`,
      typeName: 'Task',
      labels: [],
      epic: null,
      ...overrides,
    },
  }
}

describe('assembleColumns', () => {
  it('returns four empty columns when there are no live or leaving issues', () => {
    const result = assembleColumns({
      liveIssues: [],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO']).toEqual([])
    expect(result['In Implementation']).toEqual([])
    expect(result['In Code Review']).toEqual([])
    expect(result.Done).toEqual([])
  })

  it('places one issue per column with state idle when nothing is entering or changed', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { statusName: 'Reviewed' }),
        issue('A-2', { statusName: 'In Implementation' }),
        issue('A-3', { statusName: 'In Code Review' }),
        issue('A-4', { statusName: 'Done' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO'].map(jiraKeyOf)).toEqual(['A-1'])
    expect(result['In Implementation'].map(jiraKeyOf)).toEqual(['A-2'])
    expect(result['In Code Review'].map(jiraKeyOf)).toEqual(['A-3'])
    expect(result.Done.map(jiraKeyOf)).toEqual(['A-4'])
    expect(result['TO DO'][0]?.state).toBe('idle')
  })

  it('marks an issue in enteringKeys as entering', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      leaving: NO_LEAVING,
      enteringKeys: new Set(['A-1']),
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it('marks an issue in changedKeys as changed', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: new Set(['A-1']),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('changed')
  })

  it("when an issue is in both enteringKeys and changedKeys, 'entering' wins", () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      leaving: NO_LEAVING,
      enteringKeys: new Set(['A-1']),
      changedKeys: new Set(['A-1']),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it('appends a leaving issue to its frozen column, not its current statusName column', () => {
    const leaving = new Map<string, LeavingIssue>([
      ['A-1', leavingIssue('A-1', 'Done', { statusName: 'Reviewed' })],
    ])
    const result = assembleColumns({
      liveIssues: [],
      leaving,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result['TO DO']).toEqual([])
    expect(result.Done.map(jiraKeyOf)).toEqual(['A-1'])
    expect(result.Done[0]?.state).toBe('leaving')
  })

  it('searchQuery filters live issues', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { summary: 'Add login flow' }),
        issue('A-2', { summary: 'Refactor auth' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: 'login',
    })
    expect(result['TO DO'].map(jiraKeyOf)).toEqual(['A-1'])
  })

  it('searchQuery filters leaving issues', () => {
    const leaving = new Map<string, LeavingIssue>([
      ['A-1', leavingIssue('A-1', 'TO DO', { summary: 'Add login flow' })],
      ['A-2', leavingIssue('A-2', 'TO DO', { summary: 'Refactor auth' })],
    ])
    const result = assembleColumns({
      liveIssues: [],
      leaving,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: 'login',
    })
    expect(result['TO DO'].map(jiraKeyOf)).toEqual(['A-1'])
  })

  it('preserves animation state across the Done-column sort', () => {
    const liveIssues = [
      issue('A-1', { statusName: 'Done' }),
      issue('A-2', { statusName: 'In STG' }),
      issue('A-3', { statusName: 'In QA' }),
    ]
    const result = assembleColumns({
      liveIssues,
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: new Set(['A-2']),
      searchQuery: '',
    })
    expect(result.Done.map(jiraKeyOf)).toEqual(['A-2', 'A-3', 'A-1'])
    expect(result.Done.map((item) => item.state)).toEqual(['changed', 'idle', 'idle'])
  })

  it('places HDR-cased status names into the same column as Title-cased equivalents', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1', { statusName: 'IN STG' }), issue('A-2', { statusName: 'In STG' })],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      searchQuery: '',
    })
    expect(result.Done.map(jiraKeyOf).toSorted()).toEqual(['A-1', 'A-2'])
  })

  it('places needs-review and rejected review cards in TO DO and accepted in Done', () => {
    const result = assembleColumns({
      liveIssues: [],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      reviewCards: [
        reviewCard(101, 'needs-review', 'A-10'),
        reviewCard(102, 'rejected', 'A-11'),
        reviewCard(103, 'accepted', 'A-12'),
      ],
      searchQuery: '',
    })
    expect(result['TO DO'].map((item) => item.id)).toEqual(['review:101', 'review:102'])
    expect(result.Done.map((item) => item.id)).toEqual(['review:103'])
  })

  it('searchQuery also filters review cards by jira key/summary', () => {
    const result = assembleColumns({
      liveIssues: [],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      reviewCards: [
        reviewCard(201, 'needs-review', 'A-20', { summary: 'Add login flow' }),
        reviewCard(202, 'needs-review', 'A-21', { summary: 'Refactor auth' }),
      ],
      searchQuery: 'login',
    })
    expect(result['TO DO'].map((item) => item.id)).toEqual(['review:201'])
  })

  it('does not affect Jira card placement when review cards are present', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { statusName: 'Reviewed' }),
        issue('A-2', { statusName: 'Done' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      reviewCards: [reviewCard(301, 'needs-review', 'A-30')],
      searchQuery: '',
    })
    expect(result['TO DO'].filter((i) => i.card.kind === 'jira').map(jiraKeyOf)).toEqual(['A-1'])
    expect(result.Done.filter((i) => i.card.kind === 'jira').map(jiraKeyOf)).toEqual(['A-2'])
    expect(result['TO DO'].map((item) => item.id)).toEqual(['review:301', 'A-1'])
  })

  it('sorts review cards and Jira cards together by review-state tiers in TO DO', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { statusName: 'Reviewed' }),
        issue('A-2', { statusName: 'Blocked' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      reviewCards: [
        reviewCard(401, 'rejected', 'A-40'),
        reviewCard(402, 'needs-review', 'A-41'),
      ],
      searchQuery: '',
    })
    expect(result['TO DO'].map((item) => item.id)).toEqual([
      'review:402',
      'A-1',
      'review:401',
      'A-2',
    ])
  })

  it('sorts Review Accepted review cards to the bottom of Done', () => {
    const result = assembleColumns({
      liveIssues: [
        issue('A-1', { statusName: 'Done' }),
        issue('A-2', { statusName: 'In STG' }),
      ],
      leaving: NO_LEAVING,
      enteringKeys: NO_KEYS,
      changedKeys: NO_KEYS,
      reviewCards: [reviewCard(501, 'accepted', 'A-50')],
      searchQuery: '',
    })
    expect(result.Done.map((item) => item.id)).toEqual(['A-2', 'A-1', 'review:501'])
  })
})
