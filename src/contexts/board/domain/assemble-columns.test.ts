import { describe, expect, it } from 'vitest'
import type { BoardIssue, ReviewCard, ReviewCardReal } from '~/kernel'
import { assembleColumns, type ColumnItem } from './assemble-columns'
import type { ChangeVisual } from './change-indication'

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

function jiraChange(overrides: Partial<ChangeVisual<BoardIssue>> = {}): ChangeVisual<BoardIssue> {
  return {
    enteringKeys: new Set<string>(),
    changedKeys: new Set<string>(),
    leaving: new Map<string, BoardIssue>(),
    ...overrides,
  }
}

function reviewChange(overrides: Partial<ChangeVisual<ReviewCard>> = {}): ChangeVisual<ReviewCard> {
  return {
    enteringKeys: new Set<string>(),
    changedKeys: new Set<string>(),
    leaving: new Map<string, ReviewCard>(),
    ...overrides,
  }
}

const NO_JIRA_CHANGE = jiraChange()

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
      jiraChange: NO_JIRA_CHANGE,
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
      jiraChange: NO_JIRA_CHANGE,
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
      jiraChange: jiraChange({ enteringKeys: new Set(['A-1']) }),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it('marks an issue in changedKeys as changed', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      jiraChange: jiraChange({ changedKeys: new Set(['A-1']) }),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('changed')
  })

  it("when an issue is in both enteringKeys and changedKeys, 'entering' wins", () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      jiraChange: jiraChange({
        enteringKeys: new Set(['A-1']),
        changedKeys: new Set(['A-1']),
      }),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it("places a leaving issue in the column derived from its snapshot's statusName", () => {
    const result = assembleColumns({
      liveIssues: [],
      jiraChange: jiraChange({
        leaving: new Map([['A-1', issue('A-1', { statusName: 'Done' })]]),
      }),
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
      jiraChange: NO_JIRA_CHANGE,
      searchQuery: 'login',
    })
    expect(result['TO DO'].map(jiraKeyOf)).toEqual(['A-1'])
  })

  it('searchQuery filters leaving issues', () => {
    const result = assembleColumns({
      liveIssues: [],
      jiraChange: jiraChange({
        leaving: new Map([
          ['A-1', issue('A-1', { summary: 'Add login flow' })],
          ['A-2', issue('A-2', { summary: 'Refactor auth' })],
        ]),
      }),
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
      jiraChange: jiraChange({ changedKeys: new Set(['A-2']) }),
      searchQuery: '',
    })
    expect(result.Done.map(jiraKeyOf)).toEqual(['A-2', 'A-3', 'A-1'])
    expect(result.Done.map((item) => item.state)).toEqual(['changed', 'idle', 'idle'])
  })

  it('places HDR-cased status names into the same column as Title-cased equivalents', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1', { statusName: 'IN STG' }), issue('A-2', { statusName: 'In STG' })],
      jiraChange: NO_JIRA_CHANGE,
      searchQuery: '',
    })
    expect(result.Done.map(jiraKeyOf).toSorted()).toEqual(['A-1', 'A-2'])
  })

  it('places needs-review and rejected review cards in TO DO and accepted in Done', () => {
    const result = assembleColumns({
      liveIssues: [],
      jiraChange: NO_JIRA_CHANGE,
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
      jiraChange: NO_JIRA_CHANGE,
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
      liveIssues: [issue('A-1', { statusName: 'Reviewed' }), issue('A-2', { statusName: 'Done' })],
      jiraChange: NO_JIRA_CHANGE,
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
      jiraChange: NO_JIRA_CHANGE,
      reviewCards: [reviewCard(401, 'rejected', 'A-40'), reviewCard(402, 'needs-review', 'A-41')],
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
      liveIssues: [issue('A-1', { statusName: 'Done' }), issue('A-2', { statusName: 'In STG' })],
      jiraChange: NO_JIRA_CHANGE,
      reviewCards: [reviewCard(501, 'accepted', 'A-50')],
      searchQuery: '',
    })
    expect(result.Done.map((item) => item.id)).toEqual(['A-2', 'A-1', 'review:501'])
  })

  it('marks a review card in reviewChange.enteringKeys as entering', () => {
    const result = assembleColumns({
      liveIssues: [],
      jiraChange: NO_JIRA_CHANGE,
      reviewCards: [reviewCard(601, 'needs-review', 'A-60')],
      reviewChange: reviewChange({ enteringKeys: new Set(['review:601']) }),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('entering')
  })

  it('marks a review card in reviewChange.changedKeys as changed', () => {
    const result = assembleColumns({
      liveIssues: [],
      jiraChange: NO_JIRA_CHANGE,
      reviewCards: [reviewCard(602, 'rejected', 'A-61')],
      reviewChange: reviewChange({ changedKeys: new Set(['review:602']) }),
      searchQuery: '',
    })
    expect(result['TO DO'][0]?.state).toBe('changed')
  })

  it('places a leaving review card in the column derived from its snapshot bucket', () => {
    const result = assembleColumns({
      liveIssues: [],
      jiraChange: NO_JIRA_CHANGE,
      reviewCards: [],
      reviewChange: reviewChange({
        leaving: new Map([['review:701', reviewCard(701, 'accepted', 'A-70')]]),
      }),
      searchQuery: '',
    })
    expect(result.Done.map((item) => item.id)).toEqual(['review:701'])
    expect(result.Done[0]?.state).toBe('leaving')
  })

  it('does not cross-contaminate animation state between Jira and review tracks', () => {
    const result = assembleColumns({
      liveIssues: [issue('A-1')],
      jiraChange: jiraChange({ changedKeys: new Set(['review:801']) }),
      reviewCards: [reviewCard(801, 'needs-review', 'A-80')],
      reviewChange: reviewChange({ changedKeys: new Set(['A-1']) }),
      searchQuery: '',
    })
    const jiraItem = result['TO DO'].find((item) => item.id === 'A-1')
    const reviewItem = result['TO DO'].find((item) => item.id === 'review:801')
    expect(jiraItem?.state).toBe('idle')
    expect(reviewItem?.state).toBe('idle')
  })
})
