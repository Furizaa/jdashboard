import { describe, expect, it } from 'vitest'
import { normalizeStatus, statusesEqual } from './status'

describe('normalizeStatus', () => {
  it('lowercases the input', () => {
    expect(normalizeStatus('In STG')).toBe('in stg')
    expect(normalizeStatus('REVIEWED')).toBe('reviewed')
    expect(normalizeStatus('done')).toBe('done')
  })
})

describe('statusesEqual', () => {
  it('matches case-insensitively', () => {
    expect(statusesEqual('In STG', 'in stg')).toBe(true)
    expect(statusesEqual('REVIEWED', 'Reviewed')).toBe(true)
  })

  it('returns false for different statuses', () => {
    expect(statusesEqual('Reviewed', 'Done')).toBe(false)
    expect(statusesEqual('In STG', 'In QA')).toBe(false)
  })
})
