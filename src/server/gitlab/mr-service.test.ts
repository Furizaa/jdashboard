import { describe, expect, it } from 'vitest'
import type {
  GatewayUser,
  GitlabGateway,
  GitlabResult,
  ListMrsQuery,
  RawApprovals,
  RawDiscussion,
  RawMrDetail,
  RawMrSummary,
  RawReviewer,
} from './gateway'
import { createGitlabMrService, type GitlabMrServiceConfig } from './mr-service'

const notImpl = (): never => {
  throw new Error('not used in this test')
}

function fakeGateway(overrides: Partial<GitlabGateway>): GitlabGateway {
  return {
    getCurrentUser: notImpl,
    listMrs: notImpl,
    getMr: notImpl,
    getMrDiscussions: notImpl,
    getMrApprovals: notImpl,
    ...overrides,
  } as GitlabGateway
}

function ok<T>(value: T): GitlabResult<T> {
  return { ok: true, value }
}

const FIXED_NOW = new Date('2026-05-07T00:00:00.000Z')

const baseConfig: GitlabMrServiceConfig = {
  jiraProjectKey: 'HDR',
  lookbackDays: 14,
  defaultStates: ['opened', 'merged'],
  clock: () => FIXED_NOW,
}

const ME: GatewayUser = { username: 'me', displayName: 'Me' }

function reviewer(username: string): RawReviewer {
  return { username, displayName: username, avatarUrl: `https://avatars/${username}` }
}

function mr(overrides: Partial<RawMrSummary> & { iid: number; title: string }): RawMrSummary {
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

describe('createGitlabMrService — getCurrentUser', () => {
  it('propagates unauthorized from the gateway', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getCurrentUser()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('returns the username/displayName view-model on success', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getCurrentUser()
    expect(result).toEqual({ ok: true, username: 'me', displayName: 'Me' })
  })
})

describe('createGitlabMrService — getMrStatuses', () => {
  it('passes authorUsername, defaultStates, and a correctly-computed updatedAfter to listMrs', async () => {
    let captured: ListMrsQuery | undefined
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs(query) {
        captured = query
        return ok([])
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    expect(result).toEqual({ ok: true, byKey: {} })
    expect(captured).toBeDefined()
    if (captured && 'authorUsername' in captured) {
      expect(captured.authorUsername).toBe('me')
    } else {
      throw new Error('expected authorUsername in query')
    }
    expect(captured!.states).toEqual(['opened', 'merged'])
    const expected = new Date(FIXED_NOW.getTime() - 14 * 24 * 60 * 60 * 1000)
    expect(captured!.updatedAfter.toISOString()).toBe(expected.toISOString())
  })

  it('returns { ok: true, byKey: {} } when no MR titles match jiraProjectKey', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([
          mr({ iid: 1, title: 'chore: update deps' }),
          mr({ iid: 2, title: 'OTHER-1: nope' }),
        ])
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    expect(result).toEqual({ ok: true, byKey: {} })
  })

  it('keeps the newest MR per Jira key when titles repeat', async () => {
    const older = mr({ iid: 1, title: 'HDR-5: first', updatedAt: '2026-05-01T00:00:00Z' })
    const newer = mr({ iid: 2, title: 'HDR-5: second', updatedAt: '2026-05-02T00:00:00Z' })
    const detailCalls: number[] = []
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([older, newer])
      },
      async getMr(iid) {
        detailCalls.push(iid)
        return ok(detail({ iid, title: `HDR-5: iid ${iid}`, state: 'merged' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    if (!result.ok) throw new Error('expected ok')
    expect(Object.keys(result.byKey)).toEqual(['HDR-5'])
    expect(result.byKey['HDR-5']?.iid).toBe(2)
    expect(detailCalls).toEqual([2])
  })

  it('does not call getMr / getMrDiscussions / getMrApprovals for losers in the dedup', async () => {
    const older = mr({ iid: 1, title: 'HDR-5: first', updatedAt: '2026-05-01T00:00:00Z' })
    const newer = mr({ iid: 2, title: 'HDR-5: second', updatedAt: '2026-05-02T00:00:00Z' })
    const detailCalls: number[] = []
    const discussionCalls: number[] = []
    const approvalCalls: number[] = []
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([older, newer])
      },
      async getMr(iid) {
        detailCalls.push(iid)
        return ok(detail({ iid, title: 'HDR-5', state: 'merged' }))
      },
      async getMrDiscussions(iid) {
        discussionCalls.push(iid)
        return ok([])
      },
      async getMrApprovals(iid) {
        approvalCalls.push(iid)
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    await service.getMrStatuses()
    expect(detailCalls).toEqual([2])
    expect(discussionCalls).toEqual([2])
    expect(approvalCalls).toEqual([2])
  })

  it('shapes a merged MR end-to-end', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1: done' })])
      },
      async getMr() {
        return ok(detail({ iid: 1, title: 'HDR-1', state: 'merged' }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    if (!result.ok) throw new Error('expected ok')
    expect(result.byKey['HDR-1']?.kind).toBe('merged')
  })

  it('shapes a draft MR end-to-end', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1: wip' })])
      },
      async getMr() {
        return ok(detail({ iid: 1, title: 'HDR-1', draft: true, reviewers: [reviewer('alice')] }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    if (!result.ok) throw new Error('expected ok')
    expect(result.byKey['HDR-1']?.kind).toBe('draft')
  })

  it('shapes a no-reviewers MR end-to-end', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1: open' })])
      },
      async getMr() {
        return ok(detail({ iid: 1, title: 'HDR-1', reviewers: [] }))
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    if (!result.ok) throw new Error('expected ok')
    expect(result.byKey['HDR-1']?.kind).toBe('no-reviewers')
  })

  it('shapes a review MR end-to-end with mixed approval/comment reviewers', async () => {
    const discussions: RawDiscussion[] = [
      {
        id: 'd1',
        notes: [{ authorUsername: 'bob', resolvable: true, resolved: false }],
      },
    ]
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1: review' })])
      },
      async getMr() {
        return ok(
          detail({
            iid: 1,
            title: 'HDR-1',
            reviewers: [reviewer('alice'), reviewer('bob')],
          }),
        )
      },
      async getMrDiscussions() {
        return ok(discussions)
      },
      async getMrApprovals() {
        return ok(approvals(['alice']))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    if (!result.ok) throw new Error('expected ok')
    const summary = result.byKey['HDR-1']
    if (summary?.kind !== 'review') throw new Error('expected review')
    expect(summary.unresolvedCount).toBe(1)
    expect(summary.reviewers.map((r) => [r.username, r.visualState])).toEqual([
      ['alice', 'green-dashed'],
      ['bob', 'blue-dashed'],
    ])
  })

  it('propagates unauthorized when getCurrentUser returns it (no further calls made)', async () => {
    let listCalled = false
    const gateway = fakeGateway({
      async getCurrentUser() {
        return { ok: false, reason: 'unauthorized' }
      },
      async listMrs() {
        listCalled = true
        return ok([])
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
    expect(listCalled).toBe(false)
  })

  it('propagates unauthorized when listMrs returns it', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('throws when a per-MR fan-out call returns not-found', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1' })])
      },
      async getMr() {
        return { ok: false, reason: 'not-found' }
      },
      async getMrDiscussions() {
        return ok([])
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    await expect(service.getMrStatuses()).rejects.toThrow(/unexpected not-found/)
  })

  it('throws when a per-MR fan-out call returns rejected', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1' })])
      },
      async getMr() {
        return ok(detail({ iid: 1, title: 'HDR-1' }))
      },
      async getMrDiscussions() {
        return { ok: false, reason: 'rejected', message: 'boom' }
      },
      async getMrApprovals() {
        return ok(approvals([]))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    await expect(service.getMrStatuses()).rejects.toThrow(/unexpected rejected: boom/)
  })

  it('builds approvedUsernames from getMrApprovals and passes it to summarizeMr correctly', async () => {
    const gateway = fakeGateway({
      async getCurrentUser() {
        return ok(ME)
      },
      async listMrs() {
        return ok([mr({ iid: 1, title: 'HDR-1' })])
      },
      async getMr() {
        return ok(
          detail({
            iid: 1,
            title: 'HDR-1',
            reviewers: [reviewer('alice'), reviewer('bob')],
          }),
        )
      },
      async getMrDiscussions() {
        return ok([
          { id: 'd1', notes: [{ authorUsername: 'bob', resolvable: true, resolved: true }] },
        ])
      },
      async getMrApprovals() {
        return ok(approvals(['alice', 'bob']))
      },
    })
    const service = createGitlabMrService(gateway, baseConfig)
    const result = await service.getMrStatuses()
    if (!result.ok) throw new Error('expected ok')
    const summary = result.byKey['HDR-1']
    if (summary?.kind !== 'review') throw new Error('expected review')
    expect(summary.allApprovedAndClean).toBe(true)
    expect(summary.reviewers.every((r) => r.visualState === 'green-solid')).toBe(true)
  })
})
