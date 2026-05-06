import { describe, expect, it } from 'vitest'
import type { GitlabMrSummary } from './client'
import { buildMrKeyMap } from './mr-key-map'

function mr(overrides: Partial<GitlabMrSummary> & { iid: number; title: string }): GitlabMrSummary {
  return {
    iid: overrides.iid,
    title: overrides.title,
    web_url: overrides.web_url ?? `https://gitlab.example.com/p/-/merge_requests/${overrides.iid}`,
    state: overrides.state ?? 'opened',
    draft: overrides.draft ?? false,
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
  }
}

describe('buildMrKeyMap', () => {
  it('maps a single key to its MR', () => {
    const mrs = [mr({ iid: 1, title: 'HDR-100: do thing' })]
    expect(buildMrKeyMap(mrs, 'HDR')).toEqual({ 'HDR-100': mrs[0] })
  })

  it('maps multiple keys in one title to the same MR', () => {
    const mrs = [mr({ iid: 1, title: 'HDR-1 and HDR-2: combined' })]
    const result = buildMrKeyMap(mrs, 'HDR')
    expect(result).toEqual({ 'HDR-1': mrs[0], 'HDR-2': mrs[0] })
  })

  it('skips MRs with no key in title', () => {
    const mrs = [mr({ iid: 1, title: 'chore: update deps' }), mr({ iid: 2, title: 'HDR-9: feat' })]
    expect(buildMrKeyMap(mrs, 'HDR')).toEqual({ 'HDR-9': mrs[1] })
  })

  it('keeps the most-recently-updated MR when two MRs share a key', () => {
    const older = mr({ iid: 1, title: 'HDR-5: first attempt', updated_at: '2026-01-01T00:00:00Z' })
    const newer = mr({ iid: 2, title: 'HDR-5: second attempt', updated_at: '2026-02-01T00:00:00Z' })
    expect(buildMrKeyMap([older, newer], 'HDR')).toEqual({ 'HDR-5': newer })
    expect(buildMrKeyMap([newer, older], 'HDR')).toEqual({ 'HDR-5': newer })
  })

  it('returns empty for empty input', () => {
    expect(buildMrKeyMap([], 'HDR')).toEqual({})
  })

  it('does not match a different project key as a substring', () => {
    const mrs = [mr({ iid: 1, title: 'OTHER-1: nope' }), mr({ iid: 2, title: 'XHDR-1: nope' })]
    expect(buildMrKeyMap(mrs, 'HDR')).toEqual({})
  })

  it('matches keys regardless of position in the title', () => {
    const mrs = [
      mr({ iid: 1, title: '[HDR-42] start' }),
      mr({ iid: 2, title: 'feat: thing (HDR-43)' }),
    ]
    const result = buildMrKeyMap(mrs, 'HDR')
    expect(result).toEqual({ 'HDR-42': mrs[0], 'HDR-43': mrs[1] })
  })

  it('deduplicates the same key appearing twice in one title', () => {
    const mrs = [mr({ iid: 1, title: 'HDR-7: first HDR-7' })]
    expect(buildMrKeyMap(mrs, 'HDR')).toEqual({ 'HDR-7': mrs[0] })
  })
})
