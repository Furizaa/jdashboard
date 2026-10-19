import { describe, expect, it } from 'vitest'
import { isSyncStale, SYNC_STALE_AFTER_MS } from './staleness'

const NOW = Date.parse('2026-10-19T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('isSyncStale', () => {
  it('is false for a chart with no epics behind it, however old', () => {
    expect(isSyncStale({ jiraSources: [], lastSyncedAt: null }, NOW)).toBe(false)
    expect(isSyncStale({ jiraSources: [], lastSyncedAt: ago(10 * 60_000) }, NOW)).toBe(false)
  })

  it('is true for a mirrored chart that has never been synced', () => {
    expect(isSyncStale({ jiraSources: ['GEO-120'], lastSyncedAt: null }, NOW)).toBe(true)
  })

  it('is false inside the five-minute window and true outside it', () => {
    const sources = ['GEO-120']
    expect(isSyncStale({ jiraSources: sources, lastSyncedAt: ago(0) }, NOW)).toBe(false)
    expect(
      isSyncStale({ jiraSources: sources, lastSyncedAt: ago(SYNC_STALE_AFTER_MS - 1) }, NOW),
    ).toBe(false)
    expect(isSyncStale({ jiraSources: sources, lastSyncedAt: ago(SYNC_STALE_AFTER_MS) }, NOW)).toBe(
      true,
    )
  })

  it('treats an unparseable timestamp as stale, so one sync repairs it', () => {
    expect(isSyncStale({ jiraSources: ['GEO-120'], lastSyncedAt: 'yesterday' }, NOW)).toBe(true)
  })

  it('is five minutes', () => {
    expect(SYNC_STALE_AFTER_MS).toBe(300_000)
  })
})
