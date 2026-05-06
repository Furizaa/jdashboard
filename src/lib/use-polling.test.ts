import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePolling } from './use-polling'

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  })
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => state === 'hidden',
  })
}

function fireVisibilityChange() {
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('usePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires refetch on the configured interval while visible', () => {
    const refetch = vi.fn()
    renderHook(() => usePolling(refetch, 1000))

    expect(refetch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    expect(refetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(2000)
    expect(refetch).toHaveBeenCalledTimes(3)
  })

  it('pauses while document is hidden', () => {
    const refetch = vi.fn()
    renderHook(() => usePolling(refetch, 1000))

    setVisibility('hidden')
    fireVisibilityChange()

    vi.advanceTimersByTime(5000)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('refetches immediately and resumes interval on visibility back to visible', () => {
    const refetch = vi.fn()
    renderHook(() => usePolling(refetch, 1000))

    setVisibility('hidden')
    fireVisibilityChange()
    vi.advanceTimersByTime(5000)
    expect(refetch).not.toHaveBeenCalled()

    setVisibility('visible')
    fireVisibilityChange()
    expect(refetch).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1000)
    expect(refetch).toHaveBeenCalledTimes(2)
  })

  it('does not start an interval if mounted while hidden', () => {
    setVisibility('hidden')
    const refetch = vi.fn()
    renderHook(() => usePolling(refetch, 1000))

    vi.advanceTimersByTime(5000)
    expect(refetch).not.toHaveBeenCalled()
  })

  it('cleans up timer and listener on unmount', () => {
    const refetch = vi.fn()
    const { unmount } = renderHook(() => usePolling(refetch, 1000))

    vi.advanceTimersByTime(1000)
    expect(refetch).toHaveBeenCalledTimes(1)

    unmount()

    vi.advanceTimersByTime(5000)
    expect(refetch).toHaveBeenCalledTimes(1)

    setVisibility('hidden')
    fireVisibilityChange()
    setVisibility('visible')
    fireVisibilityChange()
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('uses the latest refetch callback when invoked', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }: { cb: () => void }) => usePolling(cb, 1000), {
      initialProps: { cb: first },
    })

    rerender({ cb: second })

    vi.advanceTimersByTime(1000)
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })
})
