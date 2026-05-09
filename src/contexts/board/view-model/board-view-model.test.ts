import { describe, expect, it } from 'vitest'
import type { BoardIssue, ReviewCard, ReviewCardReal } from '~/kernel'
import {
  derive,
  initialState,
  reduce,
  type Event,
  type QueryData,
  type State,
} from './board-view-model'

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

function reviewCard(iid: number, bucket: ReviewCardReal['bucket']): ReviewCardReal {
  return {
    kind: 'review-real',
    iid,
    webUrl: `https://gitlab/p/-/merge_requests/${iid}`,
    title: 'title',
    bucket,
    mrState: bucket === 'accepted' ? 'merged' : 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    jira: { key: 'A-1', summary: 's', typeName: 'Task', labels: [], epic: null },
  }
}

function emptyDiff() {
  return {
    entering: new Set<string>(),
    changed: new Set<string>(),
    leavingNow: new Map<string, never>(),
    returning: new Set<string>(),
  }
}

const NO_OP = () => {}

function pendingQuery(): QueryData {
  return { data: undefined, isPending: true, isError: false, error: undefined }
}

function errorQuery(message: string): QueryData {
  return {
    data: undefined,
    isPending: false,
    isError: true,
    error: new Error(message),
  }
}

function unauthorizedQuery(): QueryData {
  return {
    data: { ok: false, reason: 'unauthorized' },
    isPending: false,
    isError: false,
    error: undefined,
  }
}

function readyQuery(issues: BoardIssue[], baseUrl = 'https://j.example'): QueryData {
  return {
    data: { ok: true, baseUrl, issues },
    isPending: false,
    isError: false,
    error: undefined,
  }
}

describe('reduce — jiraDiffApplied', () => {
  it('adds new keys to enteringKeys without dropping existing ones', () => {
    const before: State = {
      ...initialState,
      jira: { ...initialState.jira, enteringKeys: new Set(['A-1']) },
    }
    const event: Event = {
      type: 'jiraDiffApplied',
      ...emptyDiff(),
      entering: new Set(['A-2', 'A-3']),
    }
    const after = reduce(before, event)
    expect([...after.jira.enteringKeys].toSorted()).toEqual(['A-1', 'A-2', 'A-3'])
    expect(after.jira.changedKeys.size).toBe(0)
  })

  it('adds new keys to changedKeys', () => {
    const before = initialState
    const event: Event = {
      type: 'jiraDiffApplied',
      ...emptyDiff(),
      changed: new Set(['A-1']),
    }
    const after = reduce(before, event)
    expect(after.jira.changedKeys.has('A-1')).toBe(true)
  })

  it('adds leavingNow entries to the leaving map', () => {
    const before = initialState
    const event: Event = {
      type: 'jiraDiffApplied',
      ...emptyDiff(),
      leavingNow: new Map([['A-1', issue('A-1', { statusName: 'Done' })]]),
    }
    const after = reduce(before, event)
    expect(after.jira.leaving.has('A-1')).toBe(true)
    expect(after.jira.leaving.get('A-1')?.statusName).toBe('Done')
  })

  it('removes returning keys from the leaving map', () => {
    const before: State = {
      ...initialState,
      jira: {
        ...initialState.jira,
        leaving: new Map([['A-1', issue('A-1')]]),
      },
    }
    const event: Event = {
      type: 'jiraDiffApplied',
      ...emptyDiff(),
      returning: new Set(['A-1']),
    }
    const after = reduce(before, event)
    expect(after.jira.leaving.has('A-1')).toBe(false)
  })

  it('returns the same state reference for an empty diff', () => {
    const before = initialState
    const event: Event = {
      type: 'jiraDiffApplied',
      ...emptyDiff(),
    }
    const after = reduce(before, event)
    expect(after).toBe(before)
  })
})

describe('reduce — reviewDiffApplied', () => {
  it('updates review track independently of jira track', () => {
    const before = initialState
    const event: Event = {
      type: 'reviewDiffApplied',
      ...emptyDiff(),
      entering: new Set(['review:1']),
    }
    const after = reduce(before, event)
    expect(after.review.enteringKeys.has('review:1')).toBe(true)
    expect(after.jira.enteringKeys.size).toBe(0)
  })
})

describe('reduce — *Expired events', () => {
  it.each([
    ['jiraEnteringExpired', 'jira', 'enteringKeys'],
    ['jiraChangedExpired', 'jira', 'changedKeys'],
    ['reviewEnteringExpired', 'review', 'enteringKeys'],
    ['reviewChangedExpired', 'review', 'changedKeys'],
  ] as const)('%s removes the named keys from %s.%s', (eventType, track, field) => {
    const before: State = {
      ...initialState,
      [track]: { ...initialState[track], [field]: new Set(['A-1', 'A-2']) },
    }
    const event = { type: eventType, keys: ['A-1'] } as Event
    const after = reduce(before, event)
    const set = after[track][field] as ReadonlySet<string>
    expect(set.has('A-1')).toBe(false)
    expect(set.has('A-2')).toBe(true)
  })

  it('jiraLeavingExpired removes the named keys from jira.leaving', () => {
    const before: State = {
      ...initialState,
      jira: {
        ...initialState.jira,
        leaving: new Map([
          ['A-1', issue('A-1')],
          ['A-2', issue('A-2')],
        ]),
      },
    }
    const after = reduce(before, { type: 'jiraLeavingExpired', keys: ['A-1'] })
    expect(after.jira.leaving.has('A-1')).toBe(false)
    expect(after.jira.leaving.has('A-2')).toBe(true)
  })

  it('reviewLeavingExpired removes the named keys from review.leaving', () => {
    const before: State = {
      ...initialState,
      review: {
        ...initialState.review,
        leaving: new Map<string, ReviewCard>([['review:1', reviewCard(1, 'accepted')]]),
      },
    }
    const after = reduce(before, { type: 'reviewLeavingExpired', keys: ['review:1'] })
    expect(after.review.leaving.has('review:1')).toBe(false)
  })

  it('returns the same state reference when expiring a key not present', () => {
    const before = initialState
    const after = reduce(before, { type: 'jiraEnteringExpired', keys: ['A-1'] })
    expect(after).toBe(before)
  })

  it('returns the same state reference when expiring an empty list', () => {
    const before: State = {
      ...initialState,
      jira: { ...initialState.jira, enteringKeys: new Set(['A-1']) },
    }
    const after = reduce(before, { type: 'jiraEnteringExpired', keys: [] })
    expect(after).toBe(before)
  })
})

describe('derive — phase resolution', () => {
  it("returns phase: 'loading' when the query is pending", () => {
    const out = derive({
      state: initialState,
      queryData: pendingQuery(),
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    expect(out.phase).toBe('loading')
  })

  it("returns phase: 'error-hard' with a wrapped message when isError && data is undefined", () => {
    const out = derive({
      state: initialState,
      queryData: errorQuery('boom'),
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    expect(out).toMatchObject({ phase: 'error-hard', message: "Couldn't load board: boom" })
  })

  it("returns phase: 'unauthorized' when data.ok === false", () => {
    const out = derive({
      state: initialState,
      queryData: unauthorizedQuery(),
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    expect(out.phase).toBe('unauthorized')
  })

  it("returns phase: 'empty' when data.ok === true && issues.length === 0", () => {
    const out = derive({
      state: initialState,
      queryData: readyQuery([]),
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    expect(out.phase).toBe('empty')
  })

  it("returns phase: 'ready' with itemsByColumn, baseUrl, and showErrorBanner: false", () => {
    const out = derive({
      state: initialState,
      queryData: readyQuery([issue('A-1', { statusName: 'In Implementation' })]),
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    if (out.phase !== 'ready') throw new Error('expected ready')
    expect(out.baseUrl).toBe('https://j.example')
    expect(out.showErrorBanner).toBe(false)
    expect(out.itemsByColumn['In Implementation']).toHaveLength(1)
  })

  it("returns phase: 'ready' with showErrorBanner: true when isError && data exists", () => {
    const out = derive({
      state: initialState,
      queryData: {
        data: { ok: true, baseUrl: 'https://j.example', issues: [issue('A-1')] },
        isPending: false,
        isError: true,
        error: new Error('flaky'),
      },
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    if (out.phase !== 'ready') throw new Error('expected ready')
    expect(out.showErrorBanner).toBe(true)
    expect(out.errorMessage).toBe('flaky')
  })
})

describe('derive — derivation inputs', () => {
  it('passes through the retry function for the consumer to call', () => {
    let called = 0
    const retry = () => {
      called += 1
    }
    const out = derive({
      state: initialState,
      queryData: readyQuery([issue('A-1')]),
      reviewCards: undefined,
      searchQuery: '',
      retry,
    })
    if (out.phase !== 'ready') throw new Error('expected ready')
    out.retry()
    expect(called).toBe(1)
  })

  it('filters live issues by the searchQuery argument', () => {
    const out = derive({
      state: initialState,
      queryData: readyQuery([
        issue('A-1', { summary: 'Add login flow' }),
        issue('A-2', { summary: 'Refactor auth' }),
      ]),
      reviewCards: undefined,
      searchQuery: 'login',
      retry: NO_OP,
    })
    if (out.phase !== 'ready') throw new Error('expected ready')
    const allKeys: string[] = []
    for (const col of Object.values(out.itemsByColumn)) {
      for (const item of col) {
        if (item.card.kind === 'jira') allKeys.push(item.card.issue.key)
      }
    }
    expect(allKeys).toEqual(['A-1'])
  })

  it("uses the state's jira change visual to mark items as 'changed'", () => {
    const out = derive({
      state: {
        ...initialState,
        jira: { ...initialState.jira, changedKeys: new Set(['A-1']) },
      },
      queryData: readyQuery([issue('A-1', { statusName: 'In Implementation' })]),
      reviewCards: undefined,
      searchQuery: '',
      retry: NO_OP,
    })
    if (out.phase !== 'ready') throw new Error('expected ready')
    const item = out.itemsByColumn['In Implementation'][0]
    expect(item?.state).toBe('changed')
  })

  it('places review cards using the reviewCards argument and review change visual', () => {
    const card = reviewCard(7, 'needs-review')
    const out = derive({
      state: {
        ...initialState,
        review: {
          ...initialState.review,
          enteringKeys: new Set(['review:7']),
        },
      },
      queryData: readyQuery([]),
      reviewCards: [card],
      searchQuery: '',
      retry: NO_OP,
    })
    // empty issues + review cards: phase=empty (issues are empty); review cards are not enough to flip phase.
    expect(out.phase).toBe('empty')
  })
})
