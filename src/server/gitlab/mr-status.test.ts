import { describe, expect, it } from 'vitest'
import type { GitlabDiscussion, GitlabMrDetail, GitlabReviewer } from './client'
import { summarizeMr } from './mr-status'

function reviewer(username: string): GitlabReviewer {
  return {
    id: username.length,
    username,
    name: username,
    avatar_url: `https://avatars/${username}`,
  }
}

const NO_APPROVALS: ReadonlySet<string> = new Set()

function detail(overrides: Partial<GitlabMrDetail> = {}): GitlabMrDetail {
  return {
    iid: overrides.iid ?? 1,
    title: overrides.title ?? 'HDR-1: do thing',
    web_url: overrides.web_url ?? 'https://gitlab/p/-/merge_requests/1',
    state: overrides.state ?? 'opened',
    draft: overrides.draft ?? false,
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    reviewers: overrides.reviewers ?? [],
  }
}

const NO_DISCUSSIONS: GitlabDiscussion[] = []

describe('summarizeMr', () => {
  it('returns merged regardless of other fields', () => {
    const result = summarizeMr(
      detail({ state: 'merged', draft: true, reviewers: [reviewer('alice')] }),
      NO_DISCUSSIONS,
      new Set(['alice']),
      'me',
    )
    expect(result.kind).toBe('merged')
  })

  it('returns draft when open and draft, even with reviewers', () => {
    const result = summarizeMr(
      detail({ state: 'opened', draft: true, reviewers: [reviewer('alice')] }),
      NO_DISCUSSIONS,
      new Set(['alice']),
      'me',
    )
    expect(result.kind).toBe('draft')
  })

  it('returns no-reviewers when open, not draft, and zero reviewers', () => {
    const result = summarizeMr(
      detail({ state: 'opened', draft: false, reviewers: [] }),
      NO_DISCUSSIONS,
      NO_APPROVALS,
      'me',
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
      'me',
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.reviewers.map((r) => [r.username, r.visualState])).toEqual([
      ['alice', 'green-solid'],
      ['bob', 'gray-dashed'],
      ['carol', 'gray-dashed'],
    ])
    expect(result.allApprovedAndClean).toBe(false)
  })

  it('marks allApprovedAndClean when every reviewer is in approvedUsernames with no unresolved', () => {
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('alice'), reviewer('bob')] }),
      NO_DISCUSSIONS,
      new Set(['alice', 'bob']),
      'me',
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.allApprovedAndClean).toBe(true)
  })

  it('non-approved reviewer with notes upgrades to blue-dashed; approved with unresolved → green-dashed', () => {
    const discussions: GitlabDiscussion[] = [
      {
        id: 'd1',
        notes: [
          {
            id: 1,
            author: { id: 1, username: 'carol', name: 'Carol' },
            resolvable: true,
            resolved: false,
          },
        ],
      },
    ]
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('carol'), reviewer('alice')] }),
      discussions,
      new Set(['alice']),
      'me',
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.unresolvedCount).toBe(1)
    expect(result.reviewers).toEqual([
      expect.objectContaining({ username: 'carol', visualState: 'blue-dashed' }),
      expect.objectContaining({ username: 'alice', visualState: 'green-dashed' }),
    ])
    expect(result.allApprovedAndClean).toBe(false)
  })

  it('reviewer with no notes and not in approvedUsernames → gray-dashed', () => {
    const result = summarizeMr(
      detail({ state: 'opened', reviewers: [reviewer('alice')] }),
      NO_DISCUSSIONS,
      NO_APPROVALS,
      'me',
    )
    if (result.kind !== 'review') throw new Error('expected review')
    expect(result.reviewers[0]?.visualState).toBe('gray-dashed')
  })
})
