import { describe, expect, it } from 'vitest'
import { COLUMNS, columnForStatus, statusesForColumn, type Column } from './status-mapping'

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
