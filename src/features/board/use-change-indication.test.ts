import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { BoardIssue } from '~/server/jira'
import { FADE_MS, PULSE_MS, useChangeIndication } from './use-change-indication'

function issue(key: string, overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key,
    summary: 'Initial summary',
    statusName: 'Reviewed',
    typeName: 'Task',
    labels: [],
    ...overrides,
  }
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
    const { result } = renderHook(({ data }) => useChangeIndication(data), {
      initialProps: { data: initial as readonly BoardIssue[] | undefined },
    })

    expect(result.current.enteringKeys.size).toBe(0)
    expect(result.current.changedKeys.size).toBe(0)
    expect(result.current.leaving.size).toBe(0)
  })

  it('marks newly appeared keys as entering and clears them after the fade duration', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data),
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
      ({ data }) => useChangeIndication(data),
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
      data: [issue('A-1', { statusName: 'In Implementation', labels: ['hot'], summary: 'Renamed' })],
    })
    expect(result.current.changedKeys.has('A-1')).toBe(true)
  })

  it('does not mark a card as changed when no displayed field changed', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data),
      { initialProps: { data: [issue('A-1', { labels: ['a', 'b'] })] as readonly BoardIssue[] | undefined } },
    )

    rerender({ data: [issue('A-1', { labels: ['b', 'a'] })] })

    expect(result.current.changedKeys.size).toBe(0)
    expect(result.current.enteringKeys.size).toBe(0)
  })

  it('keeps removed cards in leaving until the fade duration elapses', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data),
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
    expect(result.current.leaving.get('A-2')?.column).toBe('In Code Review')

    act(() => {
      vi.advanceTimersByTime(FADE_MS)
    })
    expect(result.current.leaving.size).toBe(0)
  })

  it('skips animation classes when a leaving card returns in the next poll', () => {
    const { result, rerender } = renderHook(
      ({ data }) => useChangeIndication(data),
      { initialProps: { data: [issue('A-1'), issue('A-2')] as readonly BoardIssue[] | undefined } },
    )

    rerender({ data: [issue('A-1')] })
    expect(result.current.leaving.has('A-2')).toBe(true)

    rerender({ data: [issue('A-1'), issue('A-2')] })
    expect(result.current.leaving.has('A-2')).toBe(false)
    expect(result.current.enteringKeys.has('A-2')).toBe(false)
  })
})
