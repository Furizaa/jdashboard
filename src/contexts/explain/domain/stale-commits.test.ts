import { describe, expect, it } from 'vitest'
import { freshnessWarning, reportFreshness, shortSha } from './stale-commits'

const REPORTED = 'deadbeefcafe0123456789abcdef0123456789ab'
const NEWER = 'facefeed1111222233334444555566667777888'

describe('reportFreshness', () => {
  it('is current when the MR head is the commit the report describes', () => {
    expect(reportFreshness(REPORTED, REPORTED)).toBe('current')
  })

  it('has moved on when the author pushed since', () => {
    expect(reportFreshness(REPORTED, NEWER)).toBe('moved-on')
  })

  it.each([null, ''])('is unknown when GitLab answered %p', (current) => {
    // Honest ignorance, not "fine" — reviewing a stale tree unknowingly is the
    // failure the detached checkout exists to prevent.
    expect(reportFreshness(REPORTED, current)).toBe('unknown')
  })

  it('is unknown when the report names no commit', () => {
    expect(reportFreshness('', REPORTED)).toBe('unknown')
  })
})

describe('shortSha', () => {
  it('abbreviates to the seven characters git itself prints', () => {
    expect(shortSha(REPORTED)).toBe('deadbee')
  })

  it('leaves a short string alone', () => {
    expect(shortSha('abc')).toBe('abc')
    expect(shortSha('')).toBe('')
  })
})

describe('freshnessWarning', () => {
  it('says nothing when the report is current', () => {
    // A report that is up to date should be read, not reassured about.
    expect(freshnessWarning(REPORTED, REPORTED)).toBeNull()
  })

  it('names both commits when the MR has moved on', () => {
    const warning = freshnessWarning(REPORTED, NEWER)
    expect(warning).toContain('deadbee')
    expect(warning).toContain('facefee')
    expect(warning).toContain('Re-run')
  })

  it('does not claim a commit count it never checked', () => {
    // Counting would need a compare call GitLab was not asked for, and a number
    // nobody verified is worse than a SHA they can.
    expect(freshnessWarning(REPORTED, NEWER)).not.toMatch(/\d+ new commits?/u)
  })

  it('says freshness is unknown when GitLab could not be reached', () => {
    const warning = freshnessWarning(REPORTED, null)
    expect(warning).toContain('could not be reached')
    expect(warning).toContain('deadbee')
  })

  it('says nothing at all when there is no commit to talk about', () => {
    expect(freshnessWarning('', null)).toBeNull()
  })
})
