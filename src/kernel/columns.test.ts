import { describe, expect, it } from 'vitest'
import { COLUMNS, columnForStatus, isDeemphasized, statusesForColumn, type Column } from './columns'

describe('status mapping', () => {
  describe('COLUMNS canonical ordering', () => {
    it('lists columns left-to-right as TO DO, In Implementation, In Code Review, Done', () => {
      expect(COLUMNS).toEqual(['TO DO', 'In Implementation', 'In Code Review', 'Done'])
    })
  })

  describe('columnForStatus', () => {
    it.each([
      ['Reviewed', 'TO DO'],
      ['Blocked', 'TO DO'],
      ['In Implementation', 'In Implementation'],
      ['In Code Review', 'In Code Review'],
      ['In STG', 'Done'],
      ['In QA', 'Done'],
      ['In UAT', 'Done'],
      ['Done', 'Done'],
    ] as const)('maps %s to %s', (status, expected) => {
      expect(columnForStatus(status)).toBe(expected)
    })

    it('defaults unknown statuses to TO DO so cards never silently disappear', () => {
      expect(columnForStatus('Some New Status')).toBe('TO DO')
    })

    it.each([
      ['IN IMPLEMENTATION', 'In Implementation'],
      ['in code review', 'In Code Review'],
      ['IN UAT', 'Done'],
      ['done', 'Done'],
    ] as const)('matches case-insensitively: %s → %s', (status, expected) => {
      expect(columnForStatus(status)).toBe(expected)
    })
  })

  describe('statusesForColumn', () => {
    it('returns the canonical statuses for TO DO', () => {
      expect(statusesForColumn('TO DO')).toEqual(['Reviewed', 'Blocked'])
    })

    it('returns the canonical statuses for In Implementation', () => {
      expect(statusesForColumn('In Implementation')).toEqual(['In Implementation'])
    })

    it('returns the canonical statuses for In Code Review', () => {
      expect(statusesForColumn('In Code Review')).toEqual(['In Code Review'])
    })

    it('returns the canonical statuses for Done', () => {
      expect(statusesForColumn('Done')).toEqual(['In STG', 'In QA', 'In UAT', 'Done'])
    })
  })

  describe('round trip', () => {
    it('every status in statusesForColumn(c) maps back to c via columnForStatus', () => {
      for (const column of COLUMNS) {
        for (const status of statusesForColumn(column as Column)) {
          expect(columnForStatus(status)).toBe(column)
        }
      }
    })
  })
})

describe('isDeemphasized', () => {
  function issue(statusName: string) {
    return { statusName }
  }

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
