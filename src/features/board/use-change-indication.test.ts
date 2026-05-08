import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { BoardIssue } from '~/server/jira'
import {
  FADE_MS,
  PULSE_MS,
  useChangeIndication,
  type ChangeIndicationOptions,
} from './use-change-indication'

function issue(key: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key,
    summary: 'Initial summary',
    statusName: 'Reviewed',
    typeName: 'Task',
    labels: [],
    epic: null,
    ...overrides,
  }
}

function fingerprint(i: BoardIssue): string {
  return `${i.statusName}::${i.summary}::${i.labels.toSorted().join('|')}`
}

const ISSUE_OPTIONS: ChangeIndicationOptions<BoardIssue> = {
  id: (i) => i.key,
  equals: (a, b) => fingerprint(a) === fingerprint(b),
}

describe('useChangeIndication', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not flag any cards on the first data delivery', () => {
    const initial = [issue('A-1'), issue('A-2')]
    const { result } = renderHook(({ data }) => useChangeIndication(data, ISSUE_OPTIONS), {
      initialProps: { data: initial as readonly BoardIssue[] | undefined },
    })

    expect(result.current.enteringKeys.size).toBe(0)
    expect(result.current.changedKeys.size).toBe(0)
    expect(result.current.leaving.size).toBe(0)
  })

  it('marks newly appeared keys as entering and clears them after the fade duration', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data, ISSUE_OPTIONS),
      { initialProps: { data: [issue('A-1')] as readonly BoardIssue[] | undefined } },
    )

    rerender({ data: [issue('A-1'), issue('A-2')] })

    expect(result.current.enteringKeys.has('A-2')).toBe(true)
    expect(result.current.enteringKeys.has('A-1')).toBe(false)

    act(() => {
      vi.advanceTimersByTime(FADE_MS)
    })
    expect(result.current.enteringKeys.size).toBe(0)
  })

  it('marks keys whose status/labels/title changed as changed and clears them after the pulse duration', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data, ISSUE_OPTIONS),
      { initialProps: { data: [issue('A-1')] as readonly BoardIssue[] | undefined } },
    )

    rerender({ data: [issue('A-1', { statusName: 'In Implementation' })] })
    expect(result.current.changedKeys.has('A-1')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(PULSE_MS)
    })
    expect(result.current.changedKeys.size).toBe(0)

    rerender({
      data: [issue('A-1', { statusName: 'In Implementation', labels: ['hot'] })],
    })
    expect(result.current.changedKeys.has('A-1')).toBe(true)

    act(() => {
      vi.advanceTimersByTime(PULSE_MS)
    })
    rerender({
      data: [
        issue('A-1', { statusName: 'In Implementation', labels: ['hot'], summary: 'Renamed' }),
      ],
    })
    expect(result.current.changedKeys.has('A-1')).toBe(true)
  })

  it('does not mark a card as changed when no displayed field changed', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data, ISSUE_OPTIONS),
      {
        initialProps: {
          data: [issue('A-1', { labels: ['a', 'b'] })] as readonly BoardIssue[] | undefined,
        },
      },
    )

    rerender({ data: [issue('A-1', { labels: ['b', 'a'] })] })

    expect(result.current.changedKeys.size).toBe(0)
    expect(result.current.enteringKeys.size).toBe(0)
  })

  it('keeps removed cards in leaving until the fade duration elapses', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data, ISSUE_OPTIONS),
      {
        initialProps: {
          data: [issue('A-1'), issue('A-2', { statusName: 'In Code Review' })] as
            | readonly BoardIssue[]
            | undefined,
        },
      },
    )

    rerender({ data: [issue('A-1')] })

    expect(result.current.leaving.has('A-2')).toBe(true)
    expect(result.current.leaving.get('A-2')?.statusName).toBe('In Code Review')

    act(() => {
      vi.advanceTimersByTime(FADE_MS)
    })
    expect(result.current.leaving.size).toBe(0)
  })

  it('skips animation classes when a leaving card returns in the next poll', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data, ISSUE_OPTIONS),
      { initialProps: { data: [issue('A-1'), issue('A-2')] as readonly BoardIssue[] | undefined } },
    )

    rerender({ data: [issue('A-1')] })
    expect(result.current.leaving.has('A-2')).toBe(true)

    rerender({ data: [issue('A-1'), issue('A-2')] })
    expect(result.current.leaving.has('A-2')).toBe(false)
    expect(result.current.enteringKeys.has('A-2')).toBe(false)
  })

  it('keys items by a custom id selector instead of `issue.key`', () => {
    type Row = { uid: number; value: string }
    const options: ChangeIndicationOptions<Row> = {
      id: (r) => `row-${r.uid}`,
      equals: (a, b) => a.value === b.value,
    }
    const { result, rerender } = renderHook(({ data }) => useChangeIndication(data, options), {
      initialProps: {
        data: [{ uid: 1, value: 'a' }] as readonly Row[] | undefined,
      },
    })

    rerender({
      data: [
        { uid: 1, value: 'a' },
        { uid: 2, value: 'b' },
      ],
    })

    expect(result.current.enteringKeys.has('row-2')).toBe(true)
    expect(result.current.enteringKeys.has('row-1')).toBe(false)

    rerender({
      data: [
        { uid: 1, value: 'a-updated' },
        { uid: 2, value: 'b' },
      ],
    })

    expect(result.current.changedKeys.has('row-1')).toBe(true)

    rerender({ data: [{ uid: 1, value: 'a-updated' }] })

    expect(result.current.leaving.has('row-2')).toBe(true)
    expect(result.current.leaving.get('row-2')?.value).toBe('b')
  })

  it('fires `changed` on a custom field, ignoring fields the predicate does not check', () => {
    type Row = { id: string; bucket: 'red' | 'green'; title: string }
    const options: ChangeIndicationOptions<Row> = {
      id: (r) => r.id,
      equals: (a, b) => a.bucket === b.bucket,
    }
    const { result, rerender } = renderHook(({ data }) => useChangeIndication(data, options), {
      initialProps: {
        data: [{ id: 'x', bucket: 'red', title: 'first' }] as readonly Row[] | undefined,
      },
    })

    rerender({ data: [{ id: 'x', bucket: 'red', title: 'second' }] })
    expect(result.current.changedKeys.size).toBe(0)

    rerender({ data: [{ id: 'x', bucket: 'green', title: 'second' }] })
    expect(result.current.changedKeys.has('x')).toBe(true)
  })

  it('keeps two parallel invocations independent', () => {
    type Row = { id: string; bucket: string }
    const rowOptions: ChangeIndicationOptions<Row> = {
      id: (r) => r.id,
      equals: (a, b) => a.bucket === b.bucket,
    }
    const { result, rerender } = renderHook(
      ({ issues, rows }) => {
        const a = useChangeIndication(issues, ISSUE_OPTIONS)
        const b = useChangeIndication(rows, rowOptions)
        return { a, b }
      },
      {
        initialProps: {
          issues: [issue('A-1')] as readonly BoardIssue[] | undefined,
          rows: [{ id: 'x', bucket: 'red' }] as readonly Row[] | undefined,
        },
      },
    )

    // Change only the issue side.
    rerender({
      issues: [issue('A-1', { statusName: 'In Implementation' })],
      rows: [{ id: 'x', bucket: 'red' }],
    })
    expect(result.current.a.changedKeys.has('A-1')).toBe(true)
    expect(result.current.b.changedKeys.size).toBe(0)

    act(() => {
      vi.advanceTimersByTime(PULSE_MS)
    })

    // Change only the row side.
    rerender({
      issues: [issue('A-1', { statusName: 'In Implementation' })],
      rows: [{ id: 'x', bucket: 'green' }],
    })
    expect(result.current.b.changedKeys.has('x')).toBe(true)
    expect(result.current.a.changedKeys.size).toBe(0)

    // Add a new issue; row side stays quiet.
    rerender({
      issues: [issue('A-1', { statusName: 'In Implementation' }), issue('A-2')],
      rows: [{ id: 'x', bucket: 'green' }],
    })
    expect(result.current.a.enteringKeys.has('A-2')).toBe(true)
    expect(result.current.b.enteringKeys.size).toBe(0)
  })
})
