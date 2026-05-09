import { describe, expect, it } from 'vitest'
import { displayNameForStatus } from './status-display-name'

describe('displayNameForStatus', () => {
  it("renames 'Reviewed' to 'Ready to Pick'", () => {
    expect(displayNameForStatus('Reviewed')).toBe('Ready to Pick')
  })

  it("renames 'reviewed' (lowercase) to 'Ready to Pick'", () => {
    expect(displayNameForStatus('reviewed')).toBe('Ready to Pick')
  })

  it("renames 'REVIEWED' (uppercase) to 'Ready to Pick'", () => {
    expect(displayNameForStatus('REVIEWED')).toBe('Ready to Pick')
  })

  it('returns Jira statuses in title case', () => {
    expect(displayNameForStatus('Needs Review')).toBe('Needs Review')
    expect(displayNameForStatus('Review Rejected')).toBe('Review Rejected')
    expect(displayNameForStatus('Review Accepted')).toBe('Review Accepted')
    expect(displayNameForStatus('Blocked')).toBe('Blocked')
    expect(displayNameForStatus('In Implementation')).toBe('In Implementation')
    expect(displayNameForStatus('In Code Review')).toBe('In Code Review')
    expect(displayNameForStatus('Done')).toBe('Done')
  })

  it('preserves common HDR acronyms (STG, QA, UAT) in title case', () => {
    expect(displayNameForStatus('In STG')).toBe('In STG')
    expect(displayNameForStatus('In QA')).toBe('In QA')
    expect(displayNameForStatus('In UAT')).toBe('In UAT')
  })

  it('normalizes mixed/screaming casing to title case', () => {
    expect(displayNameForStatus('blocked')).toBe('Blocked')
    expect(displayNameForStatus('BLOCKED')).toBe('Blocked')
    expect(displayNameForStatus('IN CODE REVIEW')).toBe('In Code Review')
    expect(displayNameForStatus('in stg')).toBe('In STG')
  })
})
