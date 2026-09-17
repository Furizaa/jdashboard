import { describe, expect, it } from 'vitest'
import { WATCHLIST_CARD_ID_PREFIX, watchlistCardId } from './watchlist'

describe('watchlistCardId', () => {
  it('prefixes the issue key with the watchlist prefix', () => {
    expect(watchlistCardId({ key: 'HDR-42' })).toBe(`${WATCHLIST_CARD_ID_PREFIX}HDR-42`)
  })

  it('stays distinct from the bare key used by board jira cards', () => {
    expect(watchlistCardId({ key: 'HDR-42' })).not.toBe('HDR-42')
  })
})
