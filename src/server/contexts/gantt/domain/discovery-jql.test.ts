import { describe, expect, it } from 'vitest'
import { discoveryJql } from './discovery-jql'

describe('discoveryJql', () => {
  it('builds a parent clause over every epic key', () => {
    expect(discoveryJql(['GEO-120', 'GEO-355'])).toBe('parent in (GEO-120, GEO-355)')
  })

  it('is null for an empty source list, so the caller skips the search', () => {
    // Not `parent in ()`, which is a syntax error, and not a dropped clause,
    // which would match every issue in the instance — and a sync that discovered
    // everything, or nothing, is the one that does damage.
    expect(discoveryJql([])).toBeNull()
  })

  it('rejects anything that is not an issue key, naming the offending source', () => {
    for (const bad of ['GEO-120 OR key > 0', 'geo-120', 'GEO', '"GEO-1"', 'GEO-0']) {
      expect(() => discoveryJql([bad])).toThrow(/invalid issue key/u)
    }
  })

  it('names the index of the key it refused', () => {
    expect(() => discoveryJql(['GEO-1', 'nope'])).toThrow(/jiraSources\[1\]: invalid issue key/u)
  })
})
