import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, TestClock } from 'effect'
import { GitlabNotFound, GitlabUnauthorized } from '../../../gateways/gitlab/errors'
import { GitlabGateway } from '../../../gateways/gitlab/port'
import type {
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
  RawReviewer,
} from '../../../gateways/gitlab/types'
import { BoardConfig, type BoardConfigShape } from '../config'
import { fakeGitlabGateway } from './__fixtures__/fake-gitlab-gateway'
import { loadMrStatuses } from './load-mr-statuses'

const FIXED_NOW = new Date('2026-05-07T00:00:00.000Z')

const baseConfig: BoardConfigShape = {
  baseUrl: 'https://j.example',
  projectKey: 'HDR',
  labelFilter: 'Frontend',
  hideLabels: [],
  doneWindowDays: 14,
}

function withClockAt<A, E>(
  program: Effect.Effect<A, E, GitlabGateway | BoardConfig>,
  date: Date,
  gitlab: ReturnType<typeof fakeGitlabGateway>,
  config: BoardConfigShape = baseConfig,
): Effect.Effect<A, E, never> {
  return Effect.gen(function* () {
    yield* TestClock.setTime(date.getTime())
    return yield* program.pipe(
      Effect.provide(
        Layer.mergeAll(Layer.succeed(GitlabGateway, gitlab), Layer.succeed(BoardConfig, config)),
      ),
    )
  })
}

const ME = { username: 'me', displayName: 'Me' }

function reviewer(username: string): RawReviewer {
  return { username, displayName: username, avatarUrl: `https://avatars/${username}` }
}

function summary(overrides: Partial<RawMrSummary> & { iid: number; title: string }): RawMrSummary {
  return {
    iid: overrides.iid,
    title: overrides.title,
    webUrl: overrides.webUrl ?? `https://gitlab/p/-/merge_requests/${overrides.iid}`,
    state: overrides.state ?? 'opened',
    draft: overrides.draft ?? false,
    updatedAt: overrides.updatedAt ?? '2026-05-01T00:00:00Z',
  }
}

function detail(overrides: Partial<RawMrDetail> & { iid: number; title: string }): RawMrDetail {
  return {
    iid: overrides.iid,
    title: overrides.title,
    webUrl: overrides.webUrl ?? `https://gitlab/p/-/merge_requests/${overrides.iid}`,
    state: overrides.state ?? 'opened',
    draft: overrides.draft ?? false,
    updatedAt: overrides.updatedAt ?? '2026-05-01T00:00:00Z',
    reviewers: overrides.reviewers ?? [],
    headPipelineStatus: overrides.headPipelineStatus ?? null,
    hasConflicts: overrides.hasConflicts ?? false,
  }
}

function approvals(usernames: readonly string[]): RawApprovals {
  return { approvedUsernames: usernames }
}

function reviewersWithState(
  reviewers: readonly RawReviewer[],
  states: Record<string, RawMrReviewerWithState['state']> = {},
): RawMrReviewerWithState[] {
  return reviewers.map((r) => ({ ...r, state: states[r.username] ?? 'unreviewed' }))
}

describe('loadMrStatuses', () => {
  it.effect('passes authorUsername, defaultStates, and updatedAfter to listMrs', () => {
    let captured: ListMrsQuery | undefined
    const gitlab = fakeGitlabGateway({
      getCurrentUser: () => Effect.succeed(ME),
      listMrs: (query) => {
        captured = query
        return Effect.succeed([])
      },
    })
    return withClockAt(loadMrStatuses, FIXED_NOW, gitlab).pipe(
      Effect.tap((result) => {
        expect(result).toEqual({ byKey: {} })
        if (captured && 'authorUsername' in captured) {
          expect(captured.authorUsername).toBe('me')
        } else {
          throw new Error('expected authorUsername')
        }
        expect(captured!.states).toEqual(['opened', 'merged'])
        const expected = new Date(FIXED_NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
        expect(captured!.updatedAfter.toISOString()).toBe(expected.toISOString())
      }),
    )
  })

  it.effect('returns empty when no MR titles match the project key', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () =>
          Effect.succeed([
            summary({ iid: 1, title: 'chore: update deps' }),
            summary({ iid: 2, title: 'OTHER-1: nope' }),
          ]),
      })
      const result = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab)
      expect(result).toEqual({ byKey: {} })
    }),
  )

  it.effect('keeps the newest MR per Jira key (only fans out to the winner)', () => {
    const detailCalls: number[] = []
    const older = summary({ iid: 1, title: 'HDR-5: first', updatedAt: '2026-05-01T00:00:00Z' })
    const newer = summary({ iid: 2, title: 'HDR-5: second', updatedAt: '2026-05-02T00:00:00Z' })
    const gitlab = fakeGitlabGateway({
      getCurrentUser: () => Effect.succeed(ME),
      listMrs: () => Effect.succeed([older, newer]),
      getMr: (iid) => {
        detailCalls.push(iid)
        return Effect.succeed(detail({ iid, title: `HDR-5: iid ${iid}`, state: 'merged' }))
      },
      getMrDiscussions: () => Effect.succeed([]),
      getMrApprovals: () => Effect.succeed(approvals([])),
      getMrReviewers: () => Effect.succeed([]),
    })
    return withClockAt(loadMrStatuses, FIXED_NOW, gitlab).pipe(
      Effect.tap((result) => {
        expect(Object.keys(result.byKey)).toEqual(['HDR-5'])
        expect(result.byKey['HDR-5']?.iid).toBe(2)
        expect(detailCalls).toEqual([2])
      }),
    )
  })

  it.effect('shapes a merged MR end-to-end', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: done' })]),
        getMr: () => Effect.succeed(detail({ iid: 1, title: 'HDR-1', state: 'merged' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([]),
      })
      const result = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab)
      expect(result.byKey['HDR-1']?.kind).toBe('merged')
    }),
  )

  it.effect('shapes a draft MR end-to-end', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: wip' })]),
        getMr: () =>
          Effect.succeed(
            detail({ iid: 1, title: 'HDR-1', draft: true, reviewers: [reviewer('alice')] }),
          ),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed(reviewersWithState([reviewer('alice')])),
      })
      const result = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab)
      expect(result.byKey['HDR-1']?.kind).toBe('draft')
    }),
  )

  it.effect('shapes a review MR with mixed approval/comment reviewers', () =>
    Effect.gen(function* () {
      const discussions: RawDiscussion[] = [
        {
          id: 'd1',
          notes: [{ authorUsername: 'bob', resolvable: true, resolved: false, system: false }],
        },
      ]
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: review' })]),
        getMr: () =>
          Effect.succeed(
            detail({ iid: 1, title: 'HDR-1', reviewers: [reviewer('alice'), reviewer('bob')] }),
          ),
        getMrDiscussions: () => Effect.succeed(discussions),
        getMrApprovals: () => Effect.succeed(approvals(['alice'])),
        getMrReviewers: () =>
          Effect.succeed(reviewersWithState([reviewer('alice'), reviewer('bob')])),
      })
      const result = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab)
      const sum = result.byKey['HDR-1']
      if (sum?.kind !== 'review') throw new Error('expected review')
      expect(sum.unresolvedCount).toBe(1)
      expect(sum.reviewers.map((r) => [r.username, r.visualState])).toEqual([
        ['alice', 'green-dashed'],
        ['bob', 'blue-dashed'],
      ])
    }),
  )

  it.effect('marks reviewer red-solid when getMrReviewers reports requested_changes', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: review' })]),
        getMr: () =>
          Effect.succeed(
            detail({ iid: 1, title: 'HDR-1', reviewers: [reviewer('alice'), reviewer('bob')] }),
          ),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () =>
          Effect.succeed(
            reviewersWithState([reviewer('alice'), reviewer('bob')], { bob: 'requested_changes' }),
          ),
      })
      const result = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab)
      const sum = result.byKey['HDR-1']
      if (sum?.kind !== 'review') throw new Error('expected review')
      expect(sum.reviewers.map((r) => [r.username, r.visualState])).toEqual([
        ['alice', 'gray-dashed'],
        ['bob', 'red-solid'],
      ])
    }),
  )

  it.effect('propagates Unauthorized when getCurrentUser returns 401', () =>
    Effect.gen(function* () {
      let listCalled = false
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.fail(new GitlabUnauthorized()),
        listMrs: () => {
          listCalled = true
          return Effect.succeed([])
        },
      })
      const failure = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
      expect(listCalled).toBe(false)
    }),
  )

  it.effect('propagates Unauthorized when listMrs returns 401', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.fail(new GitlabUnauthorized()),
      })
      const failure = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('skips MRs whose per-MR fan-out returns NotFound, keeps the rest', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () =>
          Effect.succeed([
            summary({ iid: 1, title: 'HDR-1' }),
            summary({ iid: 2, title: 'HDR-2' }),
          ]),
        getMr: (iid) => {
          if (iid === 1) return Effect.fail(new GitlabNotFound())
          return Effect.succeed(detail({ iid, title: `HDR-${iid}`, state: 'merged' }))
        },
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([]),
      })
      const result = yield* withClockAt(loadMrStatuses, FIXED_NOW, gitlab)
      expect(Object.keys(result.byKey)).toEqual(['HDR-2'])
      expect(result.byKey['HDR-2']?.kind).toBe('merged')
    }),
  )
})
