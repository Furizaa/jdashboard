import { describe, expect, it, vi } from 'vitest'
import type { BoardIssue, DetailIssue } from '~/kernel'
import {
  derive,
  type DeriveInput,
  type IssuePanelState,
  type IssueQueryView,
} from './issue-panel-view-model'

const ISSUE_KEY = 'HDR-1'
const NEXT_KEY = 'HDR-2'
const BASE_URL = 'https://example.atlassian.net'
const JIRA_URL = `${BASE_URL}/browse/${ISSUE_KEY}`

function detailIssue(overrides: Partial<DetailIssue> = {}): DetailIssue {
  return {
    key: ISSUE_KEY,
    summary: 'A ticket',
    description: null,
    statusName: 'In Implementation',
    typeName: 'Task',
    labels: [],
    priorityName: null,
    assigneeName: null,
    reporterName: null,
    parent: null,
    subIssues: [],
    links: [],
    comments: [],
    ...overrides,
  }
}

function boardIssue(key: string, statusName: string): BoardIssue {
  return { key, summary: `Summary ${key}`, statusName, typeName: 'Task', labels: [], epic: null }
}

function pendingQuery(): IssueQueryView {
  return { data: undefined, isPending: true, isError: false, error: undefined }
}

function errorQuery(error: Error): IssueQueryView {
  return { data: undefined, isPending: false, isError: true, error }
}

function dataQuery(data: NonNullable<IssueQueryView['data']>): IssueQueryView {
  return { data, isPending: false, isError: false, error: undefined }
}

function makeInput(overrides: Partial<DeriveInput> = {}): DeriveInput {
  return {
    issueKey: ISSUE_KEY,
    issueQuery: pendingQuery(),
    boardIssues: [],
    navigate: vi.fn(),
    openInBrowser: vi.fn(),
    copyJiraLinkAndToast: vi.fn(),
    ...overrides,
  }
}

function expectReady(state: IssuePanelState): Extract<IssuePanelState, { phase: 'ready' }> {
  if (state.phase !== 'ready') throw new Error(`expected ready phase, got ${state.phase}`)
  return state
}

describe('derive — phase resolution', () => {
  it('returns phase: closed when issueKey is null', () => {
    expect(derive(makeInput({ issueKey: null }))).toEqual({ phase: 'closed' })
  })

  it('returns phase: loading when the query is pending', () => {
    const state = derive(makeInput({ issueQuery: pendingQuery() }))
    expect(state.phase).toBe('loading')
  })

  it('returns phase: error with a wrapped message when the query errors with no data', () => {
    const state = derive(makeInput({ issueQuery: errorQuery(new Error('boom')) }))
    expect(state).toMatchObject({ phase: 'error', message: "Couldn't load issue: boom" })
  })

  it('returns phase: error with "unknown error" when error has no message', () => {
    const state = derive(
      makeInput({
        issueQuery: { data: undefined, isPending: false, isError: true, error: undefined },
      }),
    )
    expect(state).toMatchObject({ phase: 'error', message: "Couldn't load issue: unknown error" })
  })

  it('returns phase: error with the unauthorized message when data.ok is false / unauthorized', () => {
    const state = derive(
      makeInput({ issueQuery: dataQuery({ ok: false, error: { _tag: 'Unauthorized' } }) }),
    )
    expect(state).toMatchObject({ phase: 'error', message: 'Invalid Jira credentials.' })
  })

  it('returns phase: error with the not-found message when data.ok is false / not-found', () => {
    const state = derive(
      makeInput({ issueQuery: dataQuery({ ok: false, error: { _tag: 'NotFound' } }) }),
    )
    expect(state).toMatchObject({ phase: 'error', message: 'Issue not found.' })
  })

  it('returns phase: ready with issue, jiraUrl, and projectKey when data is ok', () => {
    const issue = detailIssue()
    const state = derive(
      makeInput({ issueQuery: dataQuery({ ok: true, baseUrl: BASE_URL, issue }) }),
    )
    const ready = expectReady(state)
    expect(ready.issue.key).toBe(ISSUE_KEY)
    expect(ready.jiraUrl).toBe(JIRA_URL)
    expect(ready.projectKey).toBe('HDR')
  })

  it('exposes issueKey/projectKey on every open phase', () => {
    const issueKey = 'HDR-99'
    const expectations: Array<{ phase: 'loading' | 'error'; query: IssueQueryView }> = [
      { phase: 'loading', query: pendingQuery() },
      { phase: 'error', query: errorQuery(new Error('x')) },
      { phase: 'error', query: dataQuery({ ok: false, error: { _tag: 'Unauthorized' } }) },
      { phase: 'error', query: dataQuery({ ok: false, error: { _tag: 'NotFound' } }) },
    ]
    for (const { phase, query } of expectations) {
      const state = derive(makeInput({ issueKey, issueQuery: query }))
      expect(state.phase).toBe(phase)
      if (state.phase === 'closed') throw new Error('unexpected closed')
      expect(state.issueKey).toBe(issueKey)
      expect(state.projectKey).toBe('HDR')
    }
  })

  it('returns projectKey null for keys that do not match the project pattern', () => {
    const state = derive(makeInput({ issueKey: 'malformed' }))
    if (state.phase === 'closed') throw new Error('expected open')
    expect(state.projectKey).toBeNull()
  })
})

describe('derive — sibling navigation', () => {
  it('derives prevKey and nextKey from the board within the same column', () => {
    const issue = detailIssue({ statusName: 'In Implementation' })
    const board = [
      boardIssue('HDR-0', 'In Implementation'),
      boardIssue(ISSUE_KEY, 'In Implementation'),
      boardIssue(NEXT_KEY, 'In Implementation'),
    ]
    const state = derive(
      makeInput({
        issueQuery: dataQuery({ ok: true, baseUrl: BASE_URL, issue }),
        boardIssues: board,
      }),
    )
    const ready = expectReady(state)
    expect(ready.prevKey).toBe('HDR-0')
    expect(ready.nextKey).toBe(NEXT_KEY)
  })

  it('returns null prevKey and nextKey when the board is empty', () => {
    const state = derive(
      makeInput({ issueQuery: dataQuery({ ok: true, baseUrl: BASE_URL, issue: detailIssue() }) }),
    )
    const ready = expectReady(state)
    expect(ready.prevKey).toBeNull()
    expect(ready.nextKey).toBeNull()
  })
})

describe('derive — bound action callbacks', () => {
  function setupReady(extra: Partial<DeriveInput> = {}) {
    const navigate = vi.fn()
    const openInBrowser = vi.fn()
    const copyJiraLinkAndToast = vi.fn()
    const state = derive(
      makeInput({
        issueQuery: dataQuery({ ok: true, baseUrl: BASE_URL, issue: detailIssue() }),
        boardIssues: [boardIssue(ISSUE_KEY, 'In Implementation')],
        navigate,
        openInBrowser,
        copyJiraLinkAndToast,
        ...extra,
      }),
    )
    return { ready: expectReady(state), navigate, openInBrowser, copyJiraLinkAndToast }
  }

  it('close() calls navigate(null)', () => {
    const { ready, navigate } = setupReady()
    ready.close()
    expect(navigate).toHaveBeenCalledWith(null)
  })

  it('open(key) calls navigate(key)', () => {
    const { ready, navigate } = setupReady()
    ready.open('NEW-1')
    expect(navigate).toHaveBeenCalledWith('NEW-1')
  })

  it('openInJira() calls openInBrowser(jiraUrl)', () => {
    const { ready, openInBrowser } = setupReady()
    ready.openInJira()
    expect(openInBrowser).toHaveBeenCalledWith(JIRA_URL)
  })

  it('copyJiraLink() calls copyJiraLinkAndToast(jiraUrl)', () => {
    const { ready, copyJiraLinkAndToast } = setupReady()
    ready.copyJiraLink()
    expect(copyJiraLinkAndToast).toHaveBeenCalledWith(JIRA_URL)
  })

  it('open-phase close()/open() invoke navigate even in loading phase', () => {
    const navigate = vi.fn()
    const state = derive(makeInput({ navigate }))
    if (state.phase !== 'loading') throw new Error('expected loading')
    state.close()
    state.open('NEW-1')
    expect(navigate).toHaveBeenNthCalledWith(1, null)
    expect(navigate).toHaveBeenNthCalledWith(2, 'NEW-1')
  })
})
