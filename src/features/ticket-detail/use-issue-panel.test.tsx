import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import type { BoardIssue, DetailIssue, GetIssueResult, SearchIssuesResult } from '~/server/jira'
import { useIssuePanelWithDeps, type IssuePanelDeps, type IssuePanelState } from './use-issue-panel'

const ISSUE_KEY = 'HDR-1'
const NEXT_KEY = 'HDR-2'
const BASE_URL = 'https://example.atlassian.net'
const JIRA_URL = `${BASE_URL}/browse/${ISSUE_KEY}`

const ISSUE_QUERY_KEY = ['jira', 'issue', ISSUE_KEY] as const
const BOARD_QUERY_KEY = ['jira', 'board', 'issues'] as const

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
  return {
    key,
    summary: `Summary ${key}`,
    statusName,
    typeName: 'Task',
    labels: [],
    epic: null,
  }
}

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        retryOnMount: false,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  })
}

function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
}

function fakeDeps(overrides: Partial<IssuePanelDeps> = {}): IssuePanelDeps {
  return {
    navigateToIssue: vi.fn(),
    openInBrowser: vi.fn(),
    copyToClipboard: vi.fn(() => Promise.resolve()),
    toast: { success: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

function seedIssue(client: QueryClient, result: GetIssueResult) {
  client.setQueryData(ISSUE_QUERY_KEY, result)
}

function seedBoard(client: QueryClient, issues: BoardIssue[]) {
  const result: SearchIssuesResult = { ok: true, baseUrl: BASE_URL, issues }
  client.setQueryData(BOARD_QUERY_KEY, result)
}

function seedReady(client: QueryClient, issue: DetailIssue = detailIssue()) {
  seedIssue(client, { ok: true, baseUrl: BASE_URL, issue })
}

function seedPendingIssueQuery(client: QueryClient) {
  const cache = client.getQueryCache()
  const query = cache.build(client, {
    queryKey: ISSUE_QUERY_KEY,
    queryFn: () => new Promise(() => {}),
  })
  // Kick off the fetch so the query enters 'pending' / 'fetching' state.
  // The promise never resolves, so the query stays pending until cleanup.
  void query.fetch()
}

function seedErroredIssueQuery(client: QueryClient, error: Error) {
  const cache = client.getQueryCache()
  const query = cache.build(client, {
    queryKey: ISSUE_QUERY_KEY,
    queryFn: () => Promise.reject(error),
  })
  query.setState({
    ...query.state,
    data: undefined,
    dataUpdateCount: 0,
    dataUpdatedAt: 0,
    error,
    errorUpdateCount: 1,
    errorUpdatedAt: Date.now(),
    fetchFailureCount: 1,
    fetchFailureReason: error,
    fetchMeta: null,
    isInvalidated: false,
    status: 'error',
    fetchStatus: 'idle',
  })
}

function dispatchKey(init: KeyboardEventInit) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', init))
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useIssuePanelWithDeps — phase resolution', () => {
  it('returns phase: closed when issueKey is null', () => {
    const client = makeClient()
    const { result } = renderHook(
      () => useIssuePanelWithDeps(null, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    expect(result.current.phase).toBe('closed')
  })

  it('returns phase: loading while the ticket query is pending', () => {
    const client = makeClient()
    seedPendingIssueQuery(client)
    const { result, unmount } = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    expect(result.current.phase).toBe('loading')
    unmount()
  })

  it('returns phase: error with a wrapped message when the ticket query throws', () => {
    const client = makeClient()
    seedErroredIssueQuery(client, new Error('boom'))
    const { result } = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    expect(result.current).toMatchObject({
      phase: 'error',
      message: "Couldn't load issue: boom",
    })
  })

  it('returns phase: error with the unauthorized message when data.ok is false', () => {
    const client = makeClient()
    seedIssue(client, { ok: false, reason: 'unauthorized' })
    const { result } = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    expect(result.current).toMatchObject({
      phase: 'error',
      message: 'Invalid Jira credentials.',
    })
  })

  it('returns phase: error with the not-found message when data.ok is false', () => {
    const client = makeClient()
    seedIssue(client, { ok: false, reason: 'not-found' })
    const { result } = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    expect(result.current).toMatchObject({
      phase: 'error',
      message: 'Issue not found.',
    })
  })

  it('returns phase: ready with issue, jiraUrl, and projectKey', () => {
    const client = makeClient()
    seedReady(client)
    seedBoard(client, [boardIssue(ISSUE_KEY, 'In Implementation')])
    const { result } = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    expect(result.current.phase).toBe('ready')
    if (result.current.phase !== 'ready') throw new Error('expected ready')
    expect(result.current.issue.key).toBe(ISSUE_KEY)
    expect(result.current.jiraUrl).toBe(JIRA_URL)
    expect(result.current.projectKey).toBe('HDR')
  })

  it('derives prevKey and nextKey from the seeded board', () => {
    const client = makeClient()
    seedReady(client, detailIssue({ statusName: 'In Implementation' }))
    seedBoard(client, [
      boardIssue('HDR-0', 'In Implementation'),
      boardIssue(ISSUE_KEY, 'In Implementation'),
      boardIssue(NEXT_KEY, 'In Implementation'),
    ])
    const { result } = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, fakeDeps()),
      { wrapper: makeWrapper(client) },
    )
    if (result.current.phase !== 'ready') throw new Error('expected ready')
    expect(result.current.prevKey).toBe('HDR-0')
    expect(result.current.nextKey).toBe(NEXT_KEY)
  })
})

describe('useIssuePanelWithDeps — bound action callbacks', () => {
  function setupReady(deps: IssuePanelDeps) {
    const client = makeClient()
    seedReady(client)
    seedBoard(client, [
      boardIssue(ISSUE_KEY, 'In Implementation'),
      boardIssue(NEXT_KEY, 'In Implementation'),
    ])
    const view = renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, deps),
      { wrapper: makeWrapper(client) },
    )
    if (view.result.current.phase !== 'ready') {
      throw new Error('expected ready phase')
    }
    return view as unknown as { result: { current: Extract<IssuePanelState, { phase: 'ready' }> } }
  }

  it('close() calls navigateToIssue(null)', () => {
    const deps = fakeDeps()
    const { result } = setupReady(deps)
    result.current.close()
    expect(deps.navigateToIssue).toHaveBeenCalledWith(null)
  })

  it('open(key) calls navigateToIssue(key)', () => {
    const deps = fakeDeps()
    const { result } = setupReady(deps)
    result.current.open('NEW-1')
    expect(deps.navigateToIssue).toHaveBeenCalledWith('NEW-1')
  })

  it('openInJira() calls openInBrowser(jiraUrl)', () => {
    const deps = fakeDeps()
    const { result } = setupReady(deps)
    result.current.openInJira()
    expect(deps.openInBrowser).toHaveBeenCalledWith(JIRA_URL)
  })

  it('copyJiraLink() copies the URL and toasts success on resolved promise', async () => {
    const deps = fakeDeps({ copyToClipboard: vi.fn(() => Promise.resolve()) })
    const { result } = setupReady(deps)
    await act(async () => {
      result.current.copyJiraLink()
      await Promise.resolve()
    })
    expect(deps.copyToClipboard).toHaveBeenCalledWith(JIRA_URL)
    expect(deps.toast.success).toHaveBeenCalledWith('Link copied')
    expect(deps.toast.error).not.toHaveBeenCalled()
  })

  it('copyJiraLink() toasts error on rejected promise', async () => {
    const deps = fakeDeps({ copyToClipboard: vi.fn(() => Promise.reject(new Error('denied'))) })
    const { result } = setupReady(deps)
    await act(async () => {
      result.current.copyJiraLink()
      await Promise.resolve()
    })
    expect(deps.toast.error).toHaveBeenCalledWith("Couldn't copy link to clipboard")
    expect(deps.toast.success).not.toHaveBeenCalled()
  })
})

describe('useIssuePanelWithDeps — Escape handler', () => {
  it('Escape while open calls navigateToIssue(null)', () => {
    const deps = fakeDeps()
    const client = makeClient()
    seedReady(client)
    seedBoard(client, [boardIssue(ISSUE_KEY, 'In Implementation')])
    renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, deps),
      { wrapper: makeWrapper(client) },
    )
    dispatchKey({ key: 'Escape' })
    expect(deps.navigateToIssue).toHaveBeenCalledWith(null)
  })

  it('Escape while closed does NOT call navigateToIssue', () => {
    const deps = fakeDeps()
    const client = makeClient()
    renderHook(
      () => useIssuePanelWithDeps(null, deps),
      { wrapper: makeWrapper(client) },
    )
    dispatchKey({ key: 'Escape' })
    expect(deps.navigateToIssue).not.toHaveBeenCalled()
  })
})

describe('useIssuePanelWithDeps — navigation shortcuts', () => {
  function renderWithBoard(
    deps: IssuePanelDeps,
    issues: BoardIssue[],
    issue: DetailIssue = detailIssue({ statusName: 'In Implementation' }),
  ) {
    const client = makeClient()
    seedReady(client, issue)
    seedBoard(client, issues)
    return renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, deps),
      { wrapper: makeWrapper(client) },
    )
  }

  it('j navigates to nextKey', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [
      boardIssue(ISSUE_KEY, 'In Implementation'),
      boardIssue(NEXT_KEY, 'In Implementation'),
    ])
    dispatchKey({ key: 'j' })
    expect(deps.navigateToIssue).toHaveBeenCalledWith(NEXT_KEY)
  })

  it('ArrowDown navigates to nextKey', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [
      boardIssue(ISSUE_KEY, 'In Implementation'),
      boardIssue(NEXT_KEY, 'In Implementation'),
    ])
    dispatchKey({ key: 'ArrowDown' })
    expect(deps.navigateToIssue).toHaveBeenCalledWith(NEXT_KEY)
  })

  it('j is a no-op when nextKey is null', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [boardIssue(ISSUE_KEY, 'In Implementation')])
    dispatchKey({ key: 'j' })
    expect(deps.navigateToIssue).not.toHaveBeenCalled()
  })

  it('k navigates to prevKey', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [
      boardIssue('HDR-0', 'In Implementation'),
      boardIssue(ISSUE_KEY, 'In Implementation'),
    ])
    dispatchKey({ key: 'k' })
    expect(deps.navigateToIssue).toHaveBeenCalledWith('HDR-0')
  })

  it('ArrowUp navigates to prevKey', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [
      boardIssue('HDR-0', 'In Implementation'),
      boardIssue(ISSUE_KEY, 'In Implementation'),
    ])
    dispatchKey({ key: 'ArrowUp' })
    expect(deps.navigateToIssue).toHaveBeenCalledWith('HDR-0')
  })

  it('k is a no-op when prevKey is null', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [boardIssue(ISSUE_KEY, 'In Implementation')])
    dispatchKey({ key: 'k' })
    expect(deps.navigateToIssue).not.toHaveBeenCalled()
  })

  it('o opens the jira url in a new tab', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [boardIssue(ISSUE_KEY, 'In Implementation')])
    dispatchKey({ key: 'o' })
    expect(deps.openInBrowser).toHaveBeenCalledWith(JIRA_URL)
  })

  it('c copies the jira url and toasts success on resolve', async () => {
    const deps = fakeDeps({ copyToClipboard: vi.fn(() => Promise.resolve()) })
    renderWithBoard(deps, [boardIssue(ISSUE_KEY, 'In Implementation')])
    await act(async () => {
      dispatchKey({ key: 'c' })
      await Promise.resolve()
    })
    expect(deps.copyToClipboard).toHaveBeenCalledWith(JIRA_URL)
    expect(deps.toast.success).toHaveBeenCalledWith('Link copied')
  })

  it('c with metaKey held does not fire the shortcut', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [boardIssue(ISSUE_KEY, 'In Implementation')])
    dispatchKey({ key: 'c', metaKey: true })
    expect(deps.copyToClipboard).not.toHaveBeenCalled()
  })

  it('c while an <input> is focused does not fire the shortcut', () => {
    const deps = fakeDeps()
    renderWithBoard(deps, [boardIssue(ISSUE_KEY, 'In Implementation')])
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    dispatchKey({ key: 'c' })
    expect(deps.copyToClipboard).not.toHaveBeenCalled()
  })
})

describe('useIssuePanelWithDeps — polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('triggers a refetch on the issue query after 60 seconds', () => {
    const deps = fakeDeps()
    const client = makeClient()
    seedReady(client)
    seedBoard(client, [boardIssue(ISSUE_KEY, 'In Implementation')])
    renderHook(
      () => useIssuePanelWithDeps(ISSUE_KEY, deps),
      { wrapper: makeWrapper(client) },
    )

    const query = client.getQueryCache().find({ queryKey: ISSUE_QUERY_KEY })
    expect(query?.state.fetchStatus).toBe('idle')

    act(() => {
      vi.advanceTimersByTime(60_000)
    })

    expect(query?.state.fetchStatus).toBe('fetching')
  })
})
