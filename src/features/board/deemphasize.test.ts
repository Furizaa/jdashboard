import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import { isDeemphasized } from './deemphasize'

function issue(statusName: string): BoardIssue {
  return { key: 'HDR-1', summary: 'x', statusName, typeName: 'Task', labels: [], epic: null }
}

describe('isDeemphasized', () => {
  describe("column 'TO DO'", () => {
    it('is false when the issue is Reviewed', () => {
      expect(isDeemphasized(issue('Reviewed'), 'TO DO')).toBe(false)
    })

    it('is false when the issue is Needs Review', () => {
      expect(isDeemphasized(issue('Needs Review'), 'TO DO')).toBe(false)
    })

    it('is true when the issue is Review Rejected', () => {
      expect(isDeemphasized(issue('Review Rejected'), 'TO DO')).toBe(true)
    })

    it('is true when the issue is Blocked', () => {
      expect(isDeemphasized(issue('Blocked'), 'TO DO')).toBe(true)
    })

    it('is true for an unknown status', () => {
      expect(isDeemphasized(issue('Mystery'), 'TO DO')).toBe(true)
    })

    it('matches Reviewed case-insensitively', () => {
      expect(isDeemphasized(issue('reviewed'), 'TO DO')).toBe(false)
      expect(isDeemphasized(issue('REVIEWED'), 'TO DO')).toBe(false)
      expect(isDeemphasized(issue('ReViEwEd'), 'TO DO')).toBe(false)
    })

    it('matches Needs Review case-insensitively', () => {
      expect(isDeemphasized(issue('needs review'), 'TO DO')).toBe(false)
      expect(isDeemphasized(issue('NEEDS REVIEW'), 'TO DO')).toBe(false)
      expect(isDeemphasized(issue('Needs review'), 'TO DO')).toBe(false)
    })

    it('matches Review Rejected case-insensitively', () => {
      expect(isDeemphasized(issue('review rejected'), 'TO DO')).toBe(true)
      expect(isDeemphasized(issue('REVIEW REJECTED'), 'TO DO')).toBe(true)
    })
  })

  describe('other columns', () => {
    it('is false in In Implementation regardless of status', () => {
      expect(isDeemphasized(issue('In Implementation'), 'In Implementation')).toBe(false)
      expect(isDeemphasized(issue('Reviewed'), 'In Implementation')).toBe(false)
      expect(isDeemphasized(issue('Needs Review'), 'In Implementation')).toBe(false)
      expect(isDeemphasized(issue('Review Rejected'), 'In Implementation')).toBe(false)
    })

    it('is false in In Code Review regardless of status', () => {
      expect(isDeemphasized(issue('In Code Review'), 'In Code Review')).toBe(false)
      expect(isDeemphasized(issue('Reviewed'), 'In Code Review')).toBe(false)
      expect(isDeemphasized(issue('Needs Review'), 'In Code Review')).toBe(false)
      expect(isDeemphasized(issue('Review Rejected'), 'In Code Review')).toBe(false)
    })

    it('is false in Done regardless of status', () => {
      expect(isDeemphasized(issue('In STG'), 'Done')).toBe(false)
      expect(isDeemphasized(issue('In QA'), 'Done')).toBe(false)
      expect(isDeemphasized(issue('In UAT'), 'Done')).toBe(false)
      expect(isDeemphasized(issue('Done'), 'Done')).toBe(false)
      expect(isDeemphasized(issue('Blocked'), 'Done')).toBe(false)
      expect(isDeemphasized(issue('Review Accepted'), 'Done')).toBe(false)
    })
  })
})
