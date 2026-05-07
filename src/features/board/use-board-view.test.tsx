import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { UseQueryResult } from '@tanstack/react-query'
import type { BoardIssue, SearchIssuesResult } from '~/server/jira'
import { useBoardViewWithDeps, type BoardViewDeps } from './use-board-view'

function boardIssue(overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key: overrides.key ?? 'A-1',
    summary: overrides.summary ?? 'Issue summary',
    statusName: overrides.statusName ?? 'In Implementation',
    typeName: 'Task',
    labels: overrides.labels ?? [],
    epic: null,
    ...overrides,
  }
}

function fakeQuery(opts: {
  data?: SearchIssuesResult
  isPending?: boolean
  isError?: boolean
  error?: Error
  refetch?: () => void
}): UseQueryResult<SearchIssuesResult> {
  return {
    data: opts.data,
    isPending: opts.isPending ?? false,
    isError: opts.isError ?? false,
    error: opts.error,
    refetch: opts.refetch ?? (() => {}),
  } as unknown as UseQueryResult<SearchIssuesResult>
}

function fakeDeps(overrides: Partial<BoardViewDeps> = {}): BoardViewDeps {
  return {
    boardQuery: overrides.boardQuery ?? fakeQuery({ isPending: true }),
    subscribeMrStatuses: overrides.subscribeMrStatuses ?? vi.fn(),
  }
}

describe('useBoardViewWithDeps — phase resolution', () => {
  it("returns phase: 'loading' when the boardQuery is pending", () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps('', fakeDeps({ boardQuery: fakeQuery({ isPending: true }) })),
    )
    expect(result.current.phase).toBe('loading')
  })

  it("returns phase: 'error-hard' with a wrapped message when isError && data === undefined", () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({ isError: true, error: new Error('boom') }),
        }),
      ),
    )
    expect(result.current).toMatchObject({
      phase: 'error-hard',
      message: "Couldn't load board: boom",
    })
  })

  it("returns phase: 'unauthorized' when data.ok === false", () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({ data: { ok: false, reason: 'unauthorized' } }),
        }),
      ),
    )
    expect(result.current.phase).toBe('unauthorized')
  })

  it("returns phase: 'empty' when data.ok === true && issues.length === 0", () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({
            data: { ok: true, baseUrl: 'https://j.example', issues: [] },
          }),
        }),
      ),
    )
    expect(result.current.phase).toBe('empty')
  })

  it("returns phase: 'ready' with itemsByColumn, baseUrl, and showErrorBanner: false", () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({
            data: {
              ok: true,
              baseUrl: 'https://j.example',
              issues: [boardIssue({ key: 'A-1', statusName: 'In Implementation' })],
            },
          }),
        }),
      ),
    )
    if (result.current.phase !== 'ready') throw new Error('expected ready')
    expect(result.current.baseUrl).toBe('https://j.example')
    expect(result.current.showErrorBanner).toBe(false)
    expect(result.current.itemsByColumn['In Implementation']).toHaveLength(1)
  })

  it("returns phase: 'ready' with showErrorBanner: true when isError && data exists", () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({
            isError: true,
            error: new Error('flaky'),
            data: {
              ok: true,
              baseUrl: 'https://j.example',
              issues: [boardIssue({ key: 'A-1' })],
            },
          }),
        }),
      ),
    )
    if (result.current.phase !== 'ready') throw new Error('expected ready')
    expect(result.current.showErrorBanner).toBe(true)
    expect(result.current.errorMessage).toBe('flaky')
  })
})

describe('useBoardViewWithDeps — side effects', () => {
  it('calls subscribeMrStatuses on every render', () => {
    const subscribeMrStatuses = vi.fn()
    const { rerender } = renderHook(
      ({ q }: { q: string }) => useBoardViewWithDeps(q, fakeDeps({ subscribeMrStatuses })),
      { initialProps: { q: '' } },
    )
    const before = subscribeMrStatuses.mock.calls.length
    expect(before).toBeGreaterThan(0)
    rerender({ q: 'login' })
    expect(subscribeMrStatuses.mock.calls.length).toBeGreaterThan(before)
  })

  it('retry() calls boardQuery.refetch()', () => {
    const refetch = vi.fn()
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({
            data: {
              ok: true,
              baseUrl: 'https://j.example',
              issues: [boardIssue({ key: 'A-1' })],
            },
            refetch,
          }),
        }),
      ),
    )
    if (result.current.phase !== 'ready') throw new Error('expected ready')
    result.current.retry()
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('useBoardViewWithDeps — polling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('triggers boardQuery.refetch() after 60_000 ms', () => {
    const refetch = vi.fn()
    renderHook(() =>
      useBoardViewWithDeps(
        '',
        fakeDeps({
          boardQuery: fakeQuery({
            data: {
              ok: true,
              baseUrl: 'https://j.example',
              issues: [boardIssue({ key: 'A-1' })],
            },
            refetch,
          }),
        }),
      ),
    )
    expect(refetch).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(refetch).toHaveBeenCalledTimes(1)
  })
})

describe('useBoardViewWithDeps — change-indication wiring', () => {
  it("marks an issue that moved columns with state: 'changed'", () => {
    const initialQuery = fakeQuery({
      data: {
        ok: true,
        baseUrl: 'https://j.example',
        issues: [boardIssue({ key: 'A-1', statusName: 'In Implementation' })],
      },
    })
    const updatedQuery = fakeQuery({
      data: {
        ok: true,
        baseUrl: 'https://j.example',
        issues: [boardIssue({ key: 'A-1', statusName: 'Done' })],
      },
    })

    const { result, rerender } = renderHook(
      ({ q }: { q: UseQueryResult<SearchIssuesResult> }) =>
        useBoardViewWithDeps('', fakeDeps({ boardQuery: q })),
      { initialProps: { q: initialQuery } },
    )

    rerender({ q: updatedQuery })

    if (result.current.phase !== 'ready') throw new Error('expected ready')
    const doneItems = result.current.itemsByColumn.Done
    const item = doneItems.find((entry) => entry.issue.key === 'A-1')
    expect(item?.state).toBe('changed')
  })
})

describe('useBoardViewWithDeps — search query', () => {
  it('filters live issues by the searchQuery argument', () => {
    const { result } = renderHook(() =>
      useBoardViewWithDeps(
        'login',
        fakeDeps({
          boardQuery: fakeQuery({
            data: {
              ok: true,
              baseUrl: 'https://j.example',
              issues: [
                boardIssue({ key: 'A-1', summary: 'Add login flow' }),
                boardIssue({ key: 'A-2', summary: 'Refactor auth' }),
              ],
            },
          }),
        }),
      ),
    )
    if (result.current.phase !== 'ready') throw new Error('expected ready')
    const allKeys: string[] = []
    for (const col of Object.values(result.current.itemsByColumn)) {
      for (const entry of col) allKeys.push(entry.issue.key)
    }
    expect(allKeys).toEqual(['A-1'])
  })
})
