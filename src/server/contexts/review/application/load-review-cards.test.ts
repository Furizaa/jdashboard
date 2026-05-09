import { describe, expect, it } from '@effect/vitest'
import { Effect, Layer, TestClock } from 'effect'
import { GitlabNotFound, GitlabUnauthorized } from '../../../gateways/gitlab/errors'
import { GitlabGateway } from '../../../gateways/gitlab/port'
import type {
  RawApprovals,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
  RawReviewer,
} from '../../../gateways/gitlab/types'
import { JiraGateway } from '../../../gateways/jira/port'
import type { RawSearchResponse } from '../../../gateways/jira/types'
import { ReviewConfig, type ReviewConfigShape } from '../config'
import { fakeGitlabGateway } from './__fixtures__/fake-gitlab-gateway'
import { fakeJiraGateway } from './__fixtures__/fake-jira-gateway'
import { loadReviewCards } from './load-review-cards'

const FIXED_NOW = new Date('2026-05-07T00:00:00.000Z')

const baseConfig: ReviewConfigShape = {
  jiraProjectKey: 'HDR',
  lookbackDays: 14,
  hideLabels: [],
  baseUrl: 'https://j.example',
}

function provide<A, E>(
  program: Effect.Effect<A, E, GitlabGateway | JiraGateway | ReviewConfig>,
  gitlab: ReturnType<typeof fakeGitlabGateway>,
  jira: ReturnType<typeof fakeJiraGateway>,
  config: ReviewConfigShape = baseConfig,
): Effect.Effect<A, E, never> {
  return program.pipe(
    Effect.provide(
      Layer.mergeAll(
        Layer.succeed(GitlabGateway, gitlab),
        Layer.succeed(JiraGateway, jira),
        Layer.succeed(ReviewConfig, config),
      ),
    ),
  )
}

function withClockAt<A, E>(
  program: Effect.Effect<A, E, GitlabGateway | JiraGateway | ReviewConfig>,
  date: Date,
  gitlab: ReturnType<typeof fakeGitlabGateway>,
  jira: ReturnType<typeof fakeJiraGateway>,
  config: ReviewConfigShape = baseConfig,
): Effect.Effect<A, E, never> {
  return Effect.gen(function* () {
    yield* TestClock.setTime(date.getTime())
    return yield* provide(program, gitlab, jira, config)
  })
}

const ME = { username: 'me', displayName: 'Me' }

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

function reviewer(username: string): RawReviewer {
  return { username, displayName: username, avatarUrl: `https://avatars/${username}` }
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

function meReviewer(state: RawMrReviewerWithState['state']): RawMrReviewerWithState {
  return { username: 'me', displayName: 'Me', avatarUrl: null, state }
}

function emptySearch(): RawSearchResponse {
  return { issues: [] }
}

describe('loadReviewCards', () => {
  it.effect(
    'passes reviewerUsername and the lookback window from config + Clock to listMrs',
    () => {
      let captured: { reviewerUsername?: string; updatedAfter?: Date } = {}
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: (query) => {
          if ('reviewerUsername' in query) {
            captured.reviewerUsername = query.reviewerUsername
          }
          captured.updatedAfter = query.updatedAfter
          return Effect.succeed([])
        },
      })
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(emptySearch()),
      })
      return withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira).pipe(
        Effect.tap(() => {
          expect(captured.reviewerUsername).toBe('me')
          const expected = new Date(FIXED_NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
          expect(captured.updatedAfter?.toISOString()).toBe(expected.toISOString())
        }),
      )
    },
  )

  it.effect('returns empty cards when listMrs returns no MRs', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.succeed(emptySearch()),
      })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(result.cards).toEqual([])
    }),
  )

  it.effect('drops draft MRs without per-MR fan-out', () => {
    const fanCalls: number[] = []
    const gitlab = fakeGitlabGateway({
      getCurrentUser: () => Effect.succeed(ME),
      listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: wip', draft: true })]),
      getMr: (iid) => {
        fanCalls.push(iid)
        return Effect.succeed(detail({ iid, title: 'HDR-1' }))
      },
      getMrDiscussions: () => Effect.succeed([]),
      getMrApprovals: () => Effect.succeed(approvals([])),
      getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
    })
    const jira = fakeJiraGateway({ searchIssues: () => Effect.succeed(emptySearch()) })
    return withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira).pipe(
      Effect.tap((result) => {
        expect(result.cards).toEqual([])
        expect(fanCalls).toEqual([])
      }),
    )
  })

  it.effect('drops a closed MR (bucket "drop")', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: closed' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-1', state: 'closed' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({ searchIssues: () => Effect.succeed(emptySearch()) })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(result.cards).toEqual([])
    }),
  )

  it.effect('maps requested_changes on opened MR to bucket "rejected"', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1: review' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-1' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('requested_changes')]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-1',
                fields: {
                  summary: 's',
                  status: { name: 'In Code Review' },
                  issuetype: { name: 'Task' },
                  labels: [],
                },
              },
            ],
          }),
      })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(result.cards).toHaveLength(1)
      expect(result.cards[0]?.bucket).toBe('rejected')
      expect(result.cards[0]?.kind).toBe('review-real')
    }),
  )

  it.effect('maps a merged MR to bucket "accepted"', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () =>
          Effect.succeed([summary({ iid: 1, title: 'HDR-1: merged', state: 'merged' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-1', state: 'merged' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-1',
                fields: { summary: 's', status: { name: 'Done' }, issuetype: { name: 'Task' } },
              },
            ],
          }),
      })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(result.cards[0]?.bucket).toBe('accepted')
      expect(result.cards[0]?.mrState).toBe('merged')
    }),
  )

  it.effect('builds review-real card with embedded Jira metadata', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 7, title: 'HDR-7: needs review' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-7' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-7',
                fields: {
                  summary: 'jira summary',
                  status: { name: 'In Code Review' },
                  issuetype: { name: 'Bug' },
                  labels: ['lab'],
                  parent: {
                    key: 'HDR-100',
                    fields: { summary: 'epic', issuetype: { name: 'Epic' } },
                  },
                },
              },
            ],
          }),
      })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(result.cards).toHaveLength(1)
      const card = result.cards[0]!
      if (card.kind !== 'review-real') throw new Error('expected review-real')
      expect(card.iid).toBe(7)
      expect(card.bucket).toBe('needs-review')
      expect(card.jira).toEqual({
        key: 'HDR-7',
        summary: 'jira summary',
        typeName: 'Bug',
        labels: ['lab'],
        epic: { key: 'HDR-100', summary: 'epic' },
      })
      expect(result.baseUrl).toBe('https://j.example')
    }),
  )

  it.effect('emits review-fake when bulk lookup is missing the key', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 8, title: 'HDR-8: missing key' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-8' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({ searchIssues: () => Effect.succeed(emptySearch()) })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      const card = result.cards[0]!
      if (card.kind !== 'review-fake') throw new Error('expected review-fake')
      expect(card.jiraKeyAttempted).toBe('HDR-8')
    }),
  )

  it.effect('emits review-fake with jiraKeyAttempted: null when title has no Jira key', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 9, title: 'chore: update deps' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'chore: update deps' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({ searchIssues: () => Effect.succeed(emptySearch()) })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      const card = result.cards[0]!
      if (card.kind !== 'review-fake') throw new Error('expected review-fake')
      expect(card.jiraKeyAttempted).toBeNull()
    }),
  )

  it.effect('uses the first matched key when title contains multiple', () =>
    Effect.gen(function* () {
      let bulkArg: readonly string[] | undefined
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1 / HDR-2: combined' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-1 / HDR-2: combined' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({
        searchIssues: (jql) => {
          // The JQL contains the unique-key list; assert by extracting any HDR-N keys.
          bulkArg = jql.match(/HDR-\d+/g) ?? undefined
          return Effect.succeed(emptySearch())
        },
      })
      yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(bulkArg).toEqual(['HDR-1'])
    }),
  )

  it.effect('wires per-reviewer state into reviewer visual states', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1' })]),
        getMr: (iid) =>
          Effect.succeed(detail({ iid, title: 'HDR-1', reviewers: [reviewer('alice')] })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () =>
          Effect.succeed([
            meReviewer('unreviewed'),
            {
              username: 'alice',
              displayName: 'Alice',
              avatarUrl: null,
              state: 'requested_changes',
            },
            { username: 'bob', displayName: 'Bob', avatarUrl: null, state: 'approved' },
          ]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '1',
                key: 'HDR-1',
                fields: {
                  summary: 's',
                  status: { name: 'In Code Review' },
                  issuetype: { name: 'Task' },
                },
              },
            ],
          }),
      })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      const card = result.cards[0]!
      const visuals = card.reviewers.map((r) => [r.username, r.visualState])
      expect(visuals).toEqual([
        ['me', 'gray-dashed'],
        ['alice', 'red-solid'],
        ['bob', 'green-solid'],
      ])
    }),
  )

  it.effect('propagates Unauthorized from getCurrentUser', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.fail(new GitlabUnauthorized()),
      })
      const jira = fakeJiraGateway({})
      const failure = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates Unauthorized from listMrs', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.fail(new GitlabUnauthorized()),
      })
      const jira = fakeJiraGateway({})
      const failure = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates Unauthorized when any per-MR call returns 401', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-1' })),
        getMrDiscussions: () => Effect.fail(new GitlabUnauthorized()),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({ searchIssues: () => Effect.succeed(emptySearch()) })
      const failure = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('propagates Unauthorized when bulk Jira search returns 401', () =>
    Effect.gen(function* () {
      const gitlab = fakeGitlabGateway({
        getCurrentUser: () => Effect.succeed(ME),
        listMrs: () => Effect.succeed([summary({ iid: 1, title: 'HDR-1' })]),
        getMr: (iid) => Effect.succeed(detail({ iid, title: 'HDR-1' })),
        getMrDiscussions: () => Effect.succeed([]),
        getMrApprovals: () => Effect.succeed(approvals([])),
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () => Effect.fail(new GitlabUnauthorized()),
      })
      const failure = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira).pipe(Effect.flip)
      expect(failure._tag).toBe('Unauthorized')
    }),
  )

  it.effect('drops MRs whose per-MR fan-out returns NotFound but keeps the rest', () =>
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
        getMrReviewers: () => Effect.succeed([meReviewer('unreviewed')]),
      })
      const jira = fakeJiraGateway({
        searchIssues: () =>
          Effect.succeed({
            issues: [
              {
                id: '2',
                key: 'HDR-2',
                fields: { summary: 's', status: { name: 'Done' }, issuetype: { name: 'Task' } },
              },
            ],
          }),
      })
      const result = yield* withClockAt(loadReviewCards, FIXED_NOW, gitlab, jira)
      expect(result.cards.map((c) => c.iid)).toEqual([2])
    }),
  )
})
