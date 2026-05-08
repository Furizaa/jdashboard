import { describe, expect, it } from 'vitest'
import type {
  GatewayUser,
  GitlabGateway,
  GitlabResult,
  RawApprovals,
  RawMrDetail,
  RawMrReviewerWithState,
  RawMrSummary,
} from './gateway'
import {
  createGitlabReviewService,
  type GitlabReviewServiceConfig,
} from './review-service'
import type { BulkLoadIssuesResult, JiraIssueService } from '~/server/jira/issue-service'

const notImpl = (): never => {
  throw new Error('not used in this test')
}

function fakeGitlab(overrides: Partial<GitlabGateway>): GitlabGateway {
  return {
    getCurrentUser: notImpl,
    listMrs: notImpl,
    getMr: notImpl,
    getMrDiscussions: notImpl,
    getMrApprovals: notImpl,
    getMrReviewers: notImpl,
    ...overrides,
  } as GitlabGateway
}

function fakeJiraService(
  bulkLoad: (keys: readonly string[]) => Promise<BulkLoadIssuesResult>,
): JiraIssueService {
  return {
    getMyself: notImpl,
    loadBoard: notImpl,
    loadIssue: notImpl,
    loadTransitions: notImpl,
    performTransition: notImpl,
    quickCreate: notImpl,
    loadMyEpics: notImpl,
    bulkLoadIssues: bulkLoad,
  } as unknown as JiraIssueService
}

function ok<T>(value: T): GitlabResult<T> {
  return { ok: true, value }
}

const FIXED_NOW = new Date('2026-05-07T00:00:00.000Z')

const baseConfig: GitlabReviewServiceConfig = {
  jiraProjectKey: 'HDR',
  lookbackDays: 14,
  clock: () => FIXED_NOW,
}

const ME: GatewayUser = { username: 'me', displayName: 'Me' }

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

function meReviewer(state: RawMrReviewerWithState['state']): RawMrReviewerWithState {
  return { username: 'me', displayName: 'Me', avatarUrl: null, state }
}

const FOUND_BASE_URL = 'https://j.example'

function bulkOk(found: BulkLoadIssuesResult & { ok: true }): () => Promise<BulkLoadIssuesResult> {
  return async () => found
}

function bulkEmpty(): () => Promise<BulkLoadIssuesResult> {
  return async () => ({ ok: true, baseUrl: FOUND_BASE_URL, found: [], missing: [] })
}

describe('createGitlabReviewService — getReviewCards', () => {
  it('passes reviewerUsername and the same updatedAfter window to listMrs', async () => {
    let captured: { reviewerUsername?: string; updatedAfter?: Date } = {}
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs(query) {
        if ('reviewerUsername' in query) {
          captured.reviewerUsername = query.reviewerUsername
        }
        captured.updatedAfter = query.updatedAfter
        return ok([])
      },
    })
    const service = createGitlabReviewService(gateway, fakeJiraService(bulkEmpty()), baseConfig)
    await service.getReviewCards()
    expect(captured.reviewerUsername).toBe('me')
    const expected = new Date(FIXED_NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
    expect(captured.updatedAfter?.toISOString()).toBe(expected.toISOString())
  })

  it('returns empty cards array when listMrs returns no MRs (and never calls bulkLoadIssues with non-empty)', async () => {
    let bulkCalls: Array<readonly string[]> = []
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(async (keys) => {
        bulkCalls.push(keys)
        return { ok: true, baseUrl: FOUND_BASE_URL, found: [], missing: [] }
      }),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards).toEqual([])
    expect(bulkCalls).toHaveLength(1)
    expect(bulkCalls[0]).toEqual([])
  })

  it('drops draft MRs without fanning out per-MR calls', async () => {
    const fanCalls: number[] = []
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1: wip', draft: true })])
      },
      async getMr(iid) {
        fanCalls.push(iid)
        return ok(detail({ iid, title: 'HDR-1' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(gateway, fakeJiraService(bulkEmpty()), baseConfig)
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards).toEqual([])
    expect(fanCalls).toEqual([])
  })

  it('drops a closed MR (returned bucket is drop)', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1: closed' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1', state: 'closed' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(gateway, fakeJiraService(bulkEmpty()), baseConfig)
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards).toEqual([])
  })

  it('maps reviewer state requested_changes on opened MR to bucket rejected', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1: review' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('requested_changes')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(
        bulkOk({
          ok: true,
          baseUrl: FOUND_BASE_URL,
          found: [
            {
              key: 'HDR-1',
              summary: 's',
              statusName: 'In Code Review',
              typeName: 'Task',
              labels: [],
              epic: null,
            },
          ],
          missing: [],
        }),
      ),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards).toHaveLength(1)
    expect(result.cards[0]?.bucket).toBe('rejected')
    expect(result.cards[0]?.kind).toBe('review-real')
  })

  it('maps merged MR to bucket accepted regardless of reviewer state', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1: merged', state: 'merged' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1', state: 'merged' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(
        bulkOk({
          ok: true,
          baseUrl: FOUND_BASE_URL,
          found: [
            {
              key: 'HDR-1',
              summary: 's',
              statusName: 'Done',
              typeName: 'Task',
              labels: [],
              epic: null,
            },
          ],
          missing: [],
        }),
      ),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards[0]?.bucket).toBe('accepted')
    expect(result.cards[0]?.mrState).toBe('merged')
  })

  it('composes a review-real card with embedded Jira metadata for resolvable keys', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 7, title: 'HDR-7: needs review' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-7' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(
        bulkOk({
          ok: true,
          baseUrl: FOUND_BASE_URL,
          found: [
            {
              key: 'HDR-7',
              summary: 'jira summary',
              statusName: 'In Code Review',
              typeName: 'Bug',
              labels: ['lab'],
              epic: { key: 'HDR-100', summary: 'epic' },
            },
          ],
          missing: [],
        }),
      ),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards).toHaveLength(1)
    const card = result.cards[0]!
    expect(card.kind).toBe('review-real')
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
    expect(result.baseUrl).toBe(FOUND_BASE_URL)
  })

  it('emits a review-fake card with jira: null when the key is missing from bulkLoadIssues', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 8, title: 'HDR-8: missing key' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-8' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(
        bulkOk({ ok: true, baseUrl: FOUND_BASE_URL, found: [], missing: ['HDR-8'] }),
      ),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards).toHaveLength(1)
    const card = result.cards[0]!
    expect(card.kind).toBe('review-fake')
    if (card.kind !== 'review-fake') throw new Error('expected review-fake')
    expect(card.jira).toBeNull()
    expect(card.iid).toBe(8)
  })

  it('emits a review-fake card when the title contains no Jira key', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 9, title: 'chore: update deps' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'chore: update deps' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(bulkEmpty()),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    expect(result.cards[0]?.kind).toBe('review-fake')
  })

  it('wires per-reviewer state from the /reviewers payload into reviewer visual states', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([
          meReviewer('unreviewed'),
          {
            username: 'alice',
            displayName: 'Alice',
            avatarUrl: null,
            state: 'requested_changes',
          },
          { username: 'bob', displayName: 'Bob', avatarUrl: null, state: 'approved' },
        ])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(
        bulkOk({
          ok: true,
          baseUrl: FOUND_BASE_URL,
          found: [
            {
              key: 'HDR-1',
              summary: 's',
              statusName: 'In Code Review',
              typeName: 'Task',
              labels: [],
              epic: null,
            },
          ],
          missing: [],
        }),
      ),
      baseConfig,
    )
    const result = await service.getReviewCards()
    if (!result.ok) throw new Error('expected ok')
    const card = result.cards[0]!
    const visuals = card.reviewers.map((r) => [r.username, r.visualState])
    expect(visuals).toEqual([
      ['me', 'gray-dashed'],
      ['alice', 'red-solid'],
      ['bob', 'green-solid'],
    ])
  })

  it('returns unauthorized when any per-MR call returns 401', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1' }))
      },
      async getMrDiscussions() {
        return { ok: false, reason: 'unauthorized' }
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(gateway, fakeJiraService(bulkEmpty()), baseConfig)
    const result = await service.getReviewCards()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('returns unauthorized when getCurrentUser returns 401', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createGitlabReviewService(gateway, fakeJiraService(bulkEmpty()), baseConfig)
    const result = await service.getReviewCards()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('returns unauthorized when listMrs returns 401', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createGitlabReviewService(gateway, fakeJiraService(bulkEmpty()), baseConfig)
    const result = await service.getReviewCards()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('returns unauthorized when bulkLoadIssues returns 401', async () => {
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(async () => ({ ok: false, reason: 'unauthorized' })),
      baseConfig,
    )
    const result = await service.getReviewCards()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('uses the first matched Jira key when the title contains multiple keys', async () => {
    let bulkArg: readonly string[] | undefined
    const gateway = fakeGitlab({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([summary({ iid: 1, title: 'HDR-1 / HDR-2: combined' })])
      },
      async getMr(iid) {
        return ok(detail({ iid, title: 'HDR-1 / HDR-2: combined' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
      async getMrReviewers() {
        return ok([meReviewer('unreviewed')])
      },
    })
    const service = createGitlabReviewService(
      gateway,
      fakeJiraService(async (keys) => {
        bulkArg = keys
        return { ok: true, baseUrl: FOUND_BASE_URL, found: [], missing: [...keys] }
      }),
      baseConfig,
    )
    await service.getReviewCards()
    expect(bulkArg).toEqual(['HDR-1'])
  })
})
