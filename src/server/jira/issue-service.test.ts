import { describe, expect, it } from 'vitest'
import { defaultEpicConfig, defaultQuickCreateConfig } from './config'
import type {
  CreateIssueBody,
  GatewayUser,
  JiraGateway,
  JiraResult,
  RawDetailedIssue,
  RawSearchResponse,
} from './gateway'
import { createJiraIssueService, type JiraServiceConfig } from './issue-service'

const notImpl = (): never => {
  throw new Error('not used in this test')
}

function fakeGateway(overrides: Partial<JiraGateway>): JiraGateway {
  return {
    getMyself: notImpl,
    searchIssues: notImpl,
    getIssue: notImpl,
    getTransitions: notImpl,
    transitionIssue: notImpl,
    createIssue: notImpl,
    ...overrides,
  } as JiraGateway
}

function ok<T>(value: T): JiraResult<T> {
  return { ok: true, value }
}

const baseConfig: JiraServiceConfig = {
  baseUrl: 'https://example.atlassian.net',
  projectKey: 'HDR',
  labelFilter: 'Frontend',
  hideLabels: ['internal'],
  doneWindowDays: 14,
  quickCreate: defaultQuickCreateConfig,
  epic: defaultEpicConfig,
}

const meValue: GatewayUser = {
  accountId: 'acct-123',
  displayName: 'Jane Doe',
  avatarUrl: 'https://avatars.example/48.png',
}

function emptyDetailedIssue(key: string): RawDetailedIssue {
  return {
    id: 'id-' + key,
    key,
    fields: {
      summary: '',
      status: { name: 'To Do' },
    },
  }
}

function emptySearchResponse(): RawSearchResponse {
  return { issues: [] }
}

describe('createJiraIssueService — getMyself', () => {
  it('propagates unauthorized from the gateway', async () => {
    const gateway = fakeGateway({
      async getMyself() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.getMyself()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })

  it('returns the gateway user view-model on success', async () => {
    const gateway = fakeGateway({
      async getMyself() {
        return ok(meValue)
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.getMyself()
    expect(result).toEqual({
      ok: true,
      user: { accountId: 'acct-123', displayName: 'Jane Doe', avatarUrl: meValue.avatarUrl },
    })
  })
})

describe('createJiraIssueService — loadBoard', () => {
  it('builds JQL from the configured projectKey, labelFilter, and doneWindowDays', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      projectKey: 'HDR',
      labelFilter: 'Frontend',
      doneWindowDays: 14,
    })
    await service.loadBoard()
    expect(capturedJql).toBe(
      'project = HDR AND assignee = currentUser() AND labels = "Frontend" AND (statusCategory != Done OR status changed to Done after -14d) ORDER BY rank',
    )
  })

  it('escapes embedded double quotes and backslashes in the labelFilter', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      labelFilter: 'a"b\\c',
    })
    await service.loadBoard()
    expect(capturedJql).toContain('labels = "a\\"b\\\\c"')
  })

  it('applies the configured hideLabels filter case-insensitively', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '1',
              key: 'HDR-1',
              fields: {
                summary: 's',
                status: { name: 'To Do' },
                labels: ['Frontend', 'Internal', 'keep-me'],
              },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      hideLabels: ['internal'],
    })
    const result = await service.loadBoard()
    if (!result.ok) throw new Error('expected ok')
    expect(result.issues[0]?.labels).toEqual(['Frontend', 'keep-me'])
  })

  it('exposes baseUrl from config on the result', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadBoard()
    if (!result.ok) throw new Error('expected ok')
    expect(result.baseUrl).toBe('https://example.atlassian.net')
  })

  it('shapes parent into epic when parent.issuetype is Epic', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '1',
              key: 'HDR-1',
              fields: {
                summary: 's',
                status: { name: 'To Do' },
                parent: {
                  key: 'HDR-100',
                  fields: { summary: 'My Epic', issuetype: { name: 'Epic' } },
                },
              },
            },
            {
              id: '2',
              key: 'HDR-2',
              fields: {
                summary: 's2',
                status: { name: 'To Do' },
                parent: { key: 'HDR-200', fields: { issuetype: { name: 'Story' } } },
              },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadBoard()
    if (!result.ok) throw new Error('expected ok')
    expect(result.issues[0]?.epic).toEqual({ key: 'HDR-100', summary: 'My Epic' })
    expect(result.issues[1]?.epic).toBeNull()
  })

  it('propagates unauthorized', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadBoard()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })
})

describe('createJiraIssueService — loadIssue', () => {
  it('fetches main issue and sub-issues and shapes linked refs', async () => {
    const gateway = fakeGateway({
      async getIssue() {
        const issue: RawDetailedIssue = {
          id: '1',
          key: 'HDR-1',
          fields: {
            summary: 'main',
            status: { name: 'In Progress' },
            issuetype: { name: 'Task' },
            parent: {
              key: 'HDR-99',
              fields: {
                summary: 'parent epic',
                issuetype: { name: 'Epic' },
                status: {
                  name: 'In Progress',
                  statusCategory: { key: 'indeterminate', name: 'In Progress' },
                },
              },
            },
            issuelinks: [
              {
                id: 'l1',
                type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
                outwardIssue: {
                  key: 'HDR-200',
                  fields: {
                    summary: 'blocked one',
                    issuetype: { name: 'Bug' },
                    status: {
                      name: 'Done',
                      statusCategory: { key: 'done', name: 'Done' },
                    },
                  },
                },
              },
            ],
          },
        }
        return ok(issue)
      },
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '2',
              key: 'HDR-2',
              fields: {
                summary: 'sub-1',
                status: {
                  name: 'To Do',
                  statusCategory: { key: 'new', name: 'To Do' },
                },
                issuetype: { name: 'Sub-task' },
              },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadIssue('HDR-1')
    if (!result.ok) throw new Error('expected ok')
    expect(result.issue.parent).toEqual({
      key: 'HDR-99',
      summary: 'parent epic',
      typeName: 'Epic',
      statusName: 'In Progress',
      statusCategory: 'indeterminate',
    })
    expect(result.issue.subIssues).toEqual([
      {
        key: 'HDR-2',
        summary: 'sub-1',
        typeName: 'Sub-task',
        statusName: 'To Do',
        statusCategory: 'new',
      },
    ])
    expect(result.issue.links).toHaveLength(1)
    expect(result.issue.links[0]).toEqual({
      id: 'l1',
      typeName: 'Blocks',
      direction: 'outward',
      relationship: 'blocks',
      issue: {
        key: 'HDR-200',
        summary: 'blocked one',
        typeName: 'Bug',
        statusName: 'Done',
        statusCategory: 'done',
      },
    })
  })

  it('queries sub-issues with the parent key in JQL', async () => {
    let capturedSubJql: string | undefined
    const gateway = fakeGateway({
      async getIssue() {
        return ok(emptyDetailedIssue('HDR-1'))
      },
      async searchIssues(jql) {
        capturedSubJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.loadIssue('HDR-1')
    expect(capturedSubJql).toBe('parent = "HDR-1"')
  })

  it('maps not-found from the gateway to { ok: false, reason: "not-found" }', async () => {
    const gateway = fakeGateway({
      async getIssue() {
        return { ok: false, reason: 'not-found' }
      },
      async searchIssues() {
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadIssue('HDR-NOPE')
    expect(result).toEqual({ ok: false, reason: 'not-found' })
  })

  it('propagates unauthorized from the main issue fetch', async () => {
    const gateway = fakeGateway({
      async getIssue() {
        return { ok: false, reason: 'unauthorized' }
      },
      async searchIssues() {
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadIssue('HDR-1')
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })
})

describe('createJiraIssueService — loadTransitions', () => {
  it('returns the gateway transitions on success', async () => {
    const gateway = fakeGateway({
      async getTransitions() {
        return ok([{ id: '21', name: 'In Progress', toStatusName: 'In Progress' }])
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadTransitions('HDR-1')
    expect(result).toEqual({
      ok: true,
      transitions: [{ id: '21', name: 'In Progress', toStatusName: 'In Progress' }],
    })
  })

  it('propagates unauthorized', async () => {
    const gateway = fakeGateway({
      async getTransitions() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadTransitions('HDR-1')
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })
})

describe('createJiraIssueService — performTransition', () => {
  it('returns ok on success', async () => {
    const gateway = fakeGateway({
      async transitionIssue() {
        return ok(undefined)
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.performTransition('HDR-1', '21')
    expect(result).toEqual({ ok: true })
  })

  it('propagates unauthorized with a credentials message', async () => {
    const gateway = fakeGateway({
      async transitionIssue() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.performTransition('HDR-1', '21')
    expect(result).toEqual({
      ok: false,
      reason: 'unauthorized',
      message: 'Invalid Jira credentials',
    })
  })

  it('surfaces rejected with the gateway message', async () => {
    const gateway = fakeGateway({
      async transitionIssue() {
        return { ok: false, reason: 'rejected', message: 'Transition not allowed' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.performTransition('HDR-1', '21')
    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      message: 'Transition not allowed',
    })
  })
})

describe('createJiraIssueService — quickCreate', () => {
  it('prefixes summary, sets priority, labels, and assignee from config + getMyself', async () => {
    let capturedBody: CreateIssueBody | undefined
    const gateway = fakeGateway({
      async getMyself() {
        return ok(meValue)
      },
      async createIssue(body) {
        capturedBody = body
        return ok({ key: 'HDR-500' })
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      projectKey: 'HDR',
      quickCreate: { summaryPrefix: '[FE]: ', labels: ['Frontend'], priority: 'Lowest' },
    })
    const result = await service.quickCreate({
      type: 'Bug',
      parentKey: 'HDR-1',
      summary: 'broken thing',
      description: 'repro steps',
    })
    expect(result).toEqual({ ok: true, key: 'HDR-500', baseUrl: baseConfig.baseUrl })
    expect(capturedBody).toBeDefined()
    expect(capturedBody!.fields.summary).toBe('[FE]: broken thing')
    expect(capturedBody!.fields.priority).toEqual({ name: 'Lowest' })
    expect(capturedBody!.fields.labels).toEqual(['Frontend'])
    expect(capturedBody!.fields.assignee).toEqual({ accountId: 'acct-123' })
    expect(capturedBody!.fields.project).toEqual({ key: 'HDR' })
    expect(capturedBody!.fields.parent).toEqual({ key: 'HDR-1' })
    expect(capturedBody!.fields.issuetype).toEqual({ name: 'Bug' })
  })

  it('uses the configured prefix verbatim — not hardcoded', async () => {
    let capturedBody: CreateIssueBody | undefined
    const gateway = fakeGateway({
      async getMyself() {
        return ok(meValue)
      },
      async createIssue(body) {
        capturedBody = body
        return ok({ key: 'HDR-1' })
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      quickCreate: { summaryPrefix: 'CUSTOM: ', labels: ['custom-label'], priority: 'High' },
    })
    await service.quickCreate({
      type: 'Task',
      parentKey: 'HDR-1',
      summary: 'thing',
      description: 'desc',
    })
    expect(capturedBody!.fields.summary).toBe('CUSTOM: thing')
    expect(capturedBody!.fields.labels).toEqual(['custom-label'])
    expect(capturedBody!.fields.priority).toEqual({ name: 'High' })
  })

  it('produces an ADF doc node for the description', async () => {
    let capturedBody: CreateIssueBody | undefined
    const gateway = fakeGateway({
      async getMyself() {
        return ok(meValue)
      },
      async createIssue(body) {
        capturedBody = body
        return ok({ key: 'HDR-1' })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.quickCreate({
      type: 'Bug',
      parentKey: 'HDR-1',
      summary: 's',
      description: 'line one\n\nline two',
    })
    expect(capturedBody!.fields.description).toEqual({
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] },
      ],
    })
  })

  it('short-circuits when getMyself returns unauthorized — never calls createIssue', async () => {
    let createIssueCalls = 0
    const gateway = fakeGateway({
      async getMyself() {
        return { ok: false, reason: 'unauthorized' }
      },
      async createIssue() {
        createIssueCalls++
        return ok({ key: 'should-not-happen' })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.quickCreate({
      type: 'Bug',
      parentKey: 'HDR-1',
      summary: 's',
      description: 'd',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'unauthorized',
      message: 'Invalid Jira credentials',
    })
    expect(createIssueCalls).toBe(0)
  })

  it('surfaces rejected from createIssue with the gateway message', async () => {
    const gateway = fakeGateway({
      async getMyself() {
        return ok(meValue)
      },
      async createIssue() {
        return { ok: false, reason: 'rejected', message: 'Field foo is required' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.quickCreate({
      type: 'Bug',
      parentKey: 'HDR-1',
      summary: 's',
      description: 'd',
    })
    expect(result).toEqual({
      ok: false,
      reason: 'rejected',
      message: 'Field foo is required',
    })
  })
})

describe('createJiraIssueService — bulkLoadIssues', () => {
  it('short-circuits on empty input — no API call, returns empty found/missing', async () => {
    let calls = 0
    const gateway = fakeGateway({
      async searchIssues() {
        calls++
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.bulkLoadIssues([])
    expect(calls).toBe(0)
    expect(result).toEqual({
      ok: true,
      baseUrl: baseConfig.baseUrl,
      found: [],
      missing: [],
    })
  })

  it('builds JQL with key in (...) for one key', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.bulkLoadIssues(['HDR-1'])
    expect(capturedJql).toBe('key in ("HDR-1")')
  })

  it('builds JQL with comma-separated keys for many keys', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.bulkLoadIssues(['HDR-1', 'HDR-2', 'HDR-3'])
    expect(capturedJql).toBe('key in ("HDR-1", "HDR-2", "HDR-3")')
  })

  it('escapes embedded double quotes and backslashes in keys', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.bulkLoadIssues(['HDR-1', 'a"b\\c'])
    expect(capturedJql).toBe('key in ("HDR-1", "a\\"b\\\\c")')
  })

  it('dedupes input keys before calling the gateway', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.bulkLoadIssues(['HDR-1', 'HDR-2', 'HDR-1'])
    expect(capturedJql).toBe('key in ("HDR-1", "HDR-2")')
  })

  it('splits the result into found and missing', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '1',
              key: 'HDR-1',
              fields: { summary: 'one', status: { name: 'To Do' } },
            },
            {
              id: '3',
              key: 'HDR-3',
              fields: { summary: 'three', status: { name: 'Done' } },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.bulkLoadIssues(['HDR-1', 'HDR-2', 'HDR-3'])
    if (!result.ok) throw new Error('expected ok')
    expect(result.found.map((i) => i.key)).toEqual(['HDR-1', 'HDR-3'])
    expect(result.missing).toEqual(['HDR-2'])
  })

  it('shapes parent epic on bulk-loaded issues', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '1',
              key: 'HDR-1',
              fields: {
                summary: 's',
                status: { name: 'To Do' },
                parent: {
                  key: 'HDR-100',
                  fields: { summary: 'My Epic', issuetype: { name: 'Epic' } },
                },
              },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.bulkLoadIssues(['HDR-1'])
    if (!result.ok) throw new Error('expected ok')
    expect(result.found[0]?.epic).toEqual({ key: 'HDR-100', summary: 'My Epic' })
  })

  it('applies hideLabels filter on bulk-loaded issues', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '1',
              key: 'HDR-1',
              fields: {
                summary: 's',
                status: { name: 'To Do' },
                labels: ['Frontend', 'Internal'],
              },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      hideLabels: ['internal'],
    })
    const result = await service.bulkLoadIssues(['HDR-1'])
    if (!result.ok) throw new Error('expected ok')
    expect(result.found[0]?.labels).toEqual(['Frontend'])
  })

  it('propagates unauthorized', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.bulkLoadIssues(['HDR-1'])
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })
})

describe('createJiraIssueService — loadMyEpics', () => {
  it('builds JQL containing the configured statuses, not a hardcoded "In Progress"', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, {
      ...baseConfig,
      epic: { statuses: ['Active', 'Doing'] },
    })
    await service.loadMyEpics()
    expect(capturedJql).toContain('status = "Active"')
    expect(capturedJql).toContain('status = "Doing"')
    expect(capturedJql).not.toContain('In Progress')
  })

  it('with default config, builds the expected literal JQL', async () => {
    let capturedJql: string | undefined
    const gateway = fakeGateway({
      async searchIssues(jql) {
        capturedJql = jql
        return ok(emptySearchResponse())
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    await service.loadMyEpics()
    expect(capturedJql).toBe(
      'issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = "HDR"',
    )
  })

  it('shapes results into EpicRef[]', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return ok({
          issues: [
            {
              id: '1',
              key: 'HDR-100',
              fields: { summary: 'Epic A', status: { name: 'In Progress' } },
            },
          ],
        })
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadMyEpics()
    expect(result).toEqual({ ok: true, epics: [{ key: 'HDR-100', summary: 'Epic A' }] })
  })

  it('propagates unauthorized', async () => {
    const gateway = fakeGateway({
      async searchIssues() {
        return { ok: false, reason: 'unauthorized' }
      },
    })
    const service = createJiraIssueService(gateway, baseConfig)
    const result = await service.loadMyEpics()
    expect(result).toEqual({ ok: false, reason: 'unauthorized' })
  })
})
