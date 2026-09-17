import { describe, expect, it } from 'vitest'
import { buildCandidateJql, buildKeysInJql } from './candidate-jql'

describe('buildCandidateJql', () => {
  it('wraps free text in a summary wildcard, ordered newest-first', () => {
    expect(buildCandidateJql('login')).toBe('(summary ~ "login*") ORDER BY updated DESC')
  })

  it('adds an unquoted, uppercased exact key clause (first) when the text looks like an issue key', () => {
    expect(buildCandidateJql('hdr-12')).toBe(
      '(key = HDR-12 OR summary ~ "hdr-12*") ORDER BY updated DESC',
    )
  })

  it('escapes embedded quotes and backslashes', () => {
    expect(buildCandidateJql('a"b\\c')).toBe('(summary ~ "a\\"b\\\\c*") ORDER BY updated DESC')
  })
})

describe('buildKeysInJql', () => {
  it('builds a quoted key-in list, ordered newest-first', () => {
    expect(buildKeysInJql(['HDR-1', 'HDR-2'])).toBe(
      'key in ("HDR-1", "HDR-2") ORDER BY updated DESC',
    )
  })
})
