import { describe, expect, it } from 'vitest'
import type { RawDiscussion, RawMrDetail, RawReviewer } from './types'
import { summarizeMr } from './mr-status'

function reviewer(username: string): RawReviewer {
  return {
    username,
    displayName: username,
    avatarUrl: `https://avatars/${username}`,
  }
}

const NO_APPROVALS: ReadonlySet<string> = new Set()
const NO_REQUESTED_CHANGES: ReadonlySet<string> = new Set()

function detail(overrides: Partial<RawMrDetail> = {}): RawMrDetail {
  return {
    iid: overrides.iid ?? 1,
    title: overrides.title ?? 'HDR-1: do thing',
    webUrl: overrides.webUrl ?? 'https://gitlab/p/-/merge_requests/1',
    state: overrides.state ?? 'opened',
    draft: overrides.draft ?? false,
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
    reviewers: overrides.reviewers ?? [],
    headPipelineStatus: overrides.headPipelineStatus ?? null,
    hasConflicts: overrides.hasConflicts ?? false,
  }
}

const NO_DISCUSSIONS: RawDiscussion[] = []

describe('summarizeMr', () => {
  it('returns merged regardless of other fields', () => {
    const result = summarizeMr(
      detail({ state: 'merged', draft: true, reviewers: [reviewer('alice')] }),
      NO_DISCUSSIONS,
      new Set(['alice']),
      NO_REQUESTED_CHANGES,
    )
    expect(result.kind).toBe('merged')
  })

  it('returns draft when open and draft, even with reviewers', () => {
    const result = summarizeMr(
      detail({ state: 'opened', draft: true, reviewers: [reviewer('alice')] }),
      NO_DISCUSSIONS,
      new Set(['alice']),
      NO_REQUESTED_CHANGES,
    )
    expect(result.kind).toBe('draft')
  })

  it('returns no-reviewers when open, not draft, and zero reviewers', () => {
    const result = summarizeMr(
      detail({ state: 'opened', draft: false, reviewers: [] }),
      NO_DISCUSSIONS,
      NO_APPROVALS,
      NO_REQUESTED_CHANGES,
    )
    expect(result.kind).toBe('no-reviewers')
  })

  it('marks reviewer green-solid when their username is in approvedUsernames', () => {
    const result = summarizeMr(
      detail({
        state: 'opened',
        reviewers: [reviewer('alice'), reviewer('bob'), reviewer('carol')],
      }),
      NO_DISCUSSIONS,
      new Set(['alice']),
      NO_REQUESTED_CHANGES,
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.reviewers.map((r) => [r.username, r.visualState])).toEqual([
      ['alice', 'green-solid'],
      ['bob', 'gray-dashed'],
      ['carol', 'gray-dashed'],
    ])
    expect(result.allApprovedAndClean).toBe(false)
    expect(result.ciState).toBe('none')
  })

  it('marks allApprovedAndClean when every reviewer is in approvedUsernames with no unresolved', () => {
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('alice'), reviewer('bob')] }),
      NO_DISCUSSIONS,
      new Set(['alice', 'bob']),
      NO_REQUESTED_CHANGES,
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.allApprovedAndClean).toBe(true)
    expect(result.ciState).toBe('none')
  })

  it('non-approved reviewer with notes upgrades to blue-dashed; approved with unresolved → green-dashed', () => {
    const discussions: RawDiscussion[] = [
      {
        id: 'd1',
        notes: [
          {
            authorUsername: 'carol',
            resolvable: true,
            resolved: false,
            system: false,
          },
        ],
      },
    ]
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('carol'), reviewer('alice')] }),
      discussions,
      new Set(['alice']),
      NO_REQUESTED_CHANGES,
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.unresolvedCount).toBe(1)
    expect(result.reviewers).toEqual([
      expect.objectContaining({ username: 'carol', visualState: 'blue-dashed' }),
      expect.objectContaining({ username: 'alice', visualState: 'green-dashed' }),
    ])
    expect(result.allApprovedAndClean).toBe(false)
    expect(result.ciState).toBe('none')
  })

  it('reviewer with no notes and not in approvedUsernames → gray-dashed', () => {
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('alice')] }),
      NO_DISCUSSIONS,
      NO_APPROVALS,
      NO_REQUESTED_CHANGES,
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.reviewers[0]?.visualState).toBe('gray-dashed')
    expect(result.ciState).toBe('none')
  })

  it('marks reviewer red-solid when in requestedChangesUsernames', () => {
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('alice'), reviewer('bob')] }),
      NO_DISCUSSIONS,
      NO_APPROVALS,
      new Set(['bob']),
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.reviewers.map((r) => [r.username, r.visualState])).toEqual([
      ['alice', 'gray-dashed'],
      ['bob', 'red-solid'],
    ])
    expect(result.allApprovedAndClean).toBe(false)
  })
})
