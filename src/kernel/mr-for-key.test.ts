import { describe, expect, it } from 'vitest'
import type { MrSummary, ReviewCard } from './gitlab'
import { resolveMrForKey } from './mr-for-key'

function summary(overrides: { iid: number }): MrSummary {
  return {
    kind: 'merged',
    iid: overrides.iid,
    title: 'HDR-1: authored',
    webUrl: `https://gitlab.example/mr/${overrides.iid}`,
    priority: null,
  }
}

function realCard(key: string, iid: number): ReviewCard {
  return {
    kind: 'review-real',
    iid,
    webUrl: `https://gitlab.example/mr/${iid}`,
    title: `${key}: reviewing`,
    bucket: 'needs-review',
    mrState: 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    priority: null,
    jira: { key, summary: 'x', typeName: 'Task', labels: [], epic: null },
  }
}

function fakeCard(iid: number): ReviewCard {
  return {
    kind: 'review-fake',
    iid,
    webUrl: `https://gitlab.example/mr/${iid}`,
    title: 'no key',
    bucket: 'needs-review',
    mrState: 'opened',
    reviewers: [],
    unresolvedCount: 0,
    ciState: 'none',
    priority: null,
    jiraKeyAttempted: null,
  }
}

describe('resolveMrForKey', () => {
  it('finds an MR we authored', () => {
    expect(
      resolveMrForKey({
        issueKey: 'HDR-1',
        authoredByKey: { 'HDR-1': summary({ iid: 11 }) },
        reviewCards: [],
      }),
    ).toEqual({ iid: 11, webUrl: 'https://gitlab.example/mr/11' })
  })

  it('falls back to an MR we are a reviewer on', () => {
    expect(
      resolveMrForKey({
        issueKey: 'HDR-1',
        authoredByKey: {},
        reviewCards: [realCard('HDR-2', 20), realCard('HDR-1', 21)],
      }),
    ).toEqual({ iid: 21, webUrl: 'https://gitlab.example/mr/21' })
  })

  it('prefers the MR we authored over one we merely review', () => {
    expect(
      resolveMrForKey({
        issueKey: 'HDR-1',
        authoredByKey: { 'HDR-1': summary({ iid: 11 }) },
        reviewCards: [realCard('HDR-1', 21)],
      }),
    ).toMatchObject({ iid: 11 })
  })

  it('is null when neither source has one', () => {
    expect(
      resolveMrForKey({
        issueKey: 'HDR-1',
        authoredByKey: {},
        reviewCards: [realCard('HDR-2', 20)],
      }),
    ).toBeNull()
  })

  it('never matches a fake review card — it carries no key to match', () => {
    expect(
      resolveMrForKey({ issueKey: 'HDR-1', authoredByKey: {}, reviewCards: [fakeCard(30)] }),
    ).toBeNull()
  })

  it('treats a source that has not loaded as having nothing, not as an error', () => {
    expect(
      resolveMrForKey({ issueKey: 'HDR-1', authoredByKey: undefined, reviewCards: undefined }),
    ).toBeNull()
  })
})
