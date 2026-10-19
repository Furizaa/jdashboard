import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { SYNC_STALE_AFTER_MS } from '../domain'
import { useStaleChartSync, type StaleSyncInput } from './use-stale-sync'

// The three things the trigger has to get right (ADR-0012 §5): a stale chart
// syncs **once**, a fresh one never, and nothing fires while a sync is in
// flight — including across a re-render, which is the one a guard forgets.

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

function input(overrides: Partial<StaleSyncInput> = {}): StaleSyncInput {
  return {
    chartId: 'plan',
    chart: { jiraSources: ['GEO-120'], lastSyncedAt: ago(SYNC_STALE_AFTER_MS + 1) },
    sync: vi.fn(() => Promise.resolve()),
    isPending: false,
    now: () => NOW,
    ...overrides,
  }
}

describe('useStaleChartSync', () => {
  it('syncs a stale chart exactly once, and not again on a re-render', () => {
    const props = input()
    const { rerender } = renderHook((p: StaleSyncInput) => useStaleChartSync(p), {
      initialProps: props,
    })
    rerender(props)
    rerender({ ...props })
    expect(props.sync).toHaveBeenCalledTimes(1)
    expect(props.sync).toHaveBeenCalledWith('plan')
  })

  it('does not sync a chart synced inside the window', () => {
    const props = input({ chart: { jiraSources: ['GEO-120'], lastSyncedAt: ago(60_000) } })
    renderHook(() => useStaleChartSync(props))
    expect(props.sync).not.toHaveBeenCalled()
  })

  it('does not sync a chart with no epics behind it', () => {
    const props = input({ chart: { jiraSources: [], lastSyncedAt: null } })
    renderHook(() => useStaleChartSync(props))
    expect(props.sync).not.toHaveBeenCalled()
  })

  it('does nothing before the chart has arrived', () => {
    const props = input({ chart: null })
    const { rerender } = renderHook((p: StaleSyncInput) => useStaleChartSync(p), {
      initialProps: props,
    })
    expect(props.sync).not.toHaveBeenCalled()
    // …and fires once it does.
    const arrived = { ...props, chart: input().chart }
    rerender(arrived)
    expect(arrived.sync).toHaveBeenCalledTimes(1)
  })

  it('does not start a second sync while one is in flight', () => {
    const props = input({ isPending: true })
    const { rerender } = renderHook((p: StaleSyncInput) => useStaleChartSync(p), {
      initialProps: props,
    })
    rerender(props)
    expect(props.sync).not.toHaveBeenCalled()
  })

  it('decides again when the reader opens a different chart', () => {
    const props = input()
    const { rerender } = renderHook((p: StaleSyncInput) => useStaleChartSync(p), {
      initialProps: props,
    })
    rerender({ ...props, chartId: 'roadmap' })
    expect(props.sync).toHaveBeenNthCalledWith(1, 'plan')
    expect(props.sync).toHaveBeenNthCalledWith(2, 'roadmap')
    expect(props.sync).toHaveBeenCalledTimes(2)
  })

  it('swallows a failed sync rather than leaving an unhandled rejection', async () => {
    const sync = vi.fn(() => Promise.reject(new Error('Jira is down')))
    const props = input({ sync })
    renderHook(() => useStaleChartSync(props))
    await Promise.resolve()
    expect(sync).toHaveBeenCalledTimes(1)
  })
})
