import { describe, expect, it } from 'vitest'
import { displayNameForStatus } from './status-display-name'

describe('displayNameForStatus', () => {
  it("renames 'Reviewed' to 'READY TO PICK'", () => {
    expect(displayNameForStatus('Reviewed')).toBe('READY TO PICK')
  })

  it("renames 'reviewed' (lowercase) to 'READY TO PICK'", () => {
    expect(displayNameForStatus('reviewed')).toBe('READY TO PICK')
  })

  it("renames 'REVIEWED' (uppercase) to 'READY TO PICK'", () => {
    expect(displayNameForStatus('REVIEWED')).toBe('READY TO PICK')
  })

  it('passes through other Jira statuses verbatim', () => {
    expect(displayNameForStatus('Needs Review')).toBe('Needs Review')
    expect(displayNameForStatus('Review Rejected')).toBe('Review Rejected')
    expect(displayNameForStatus('Review Accepted')).toBe('Review Accepted')
    expect(displayNameForStatus('Blocked')).toBe('Blocked')
    expect(displayNameForStatus('In Implementation')).toBe('In Implementation')
    expect(displayNameForStatus('In Code Review')).toBe('In Code Review')
    expect(displayNameForStatus('In STG')).toBe('In STG')
    expect(displayNameForStatus('In QA')).toBe('In QA')
    expect(displayNameForStatus('In UAT')).toBe('In UAT')
    expect(displayNameForStatus('Done')).toBe('Done')
  })

  it('preserves the casing of the input for non-overridden statuses', () => {
    expect(displayNameForStatus('blocked')).toBe('blocked')
    expect(displayNameForStatus('BLOCKED')).toBe('BLOCKED')
  })
})
