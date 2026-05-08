import { describe, expect, it } from 'vitest'
import type { BoardIssue } from '~/server/jira'
import { sortColumnIssues } from './sort-column'

function issue(key: string, statusName: string): BoardIssue {
  return { key, summary: key, statusName, typeName: 'Task', labels: [], epic: null }
}

describe('sortColumnIssues', () => {
  describe("column 'TO DO'", () => {
    it('orders by Needs Review → Reviewed → Review Rejected → Blocked, preserving rank within each tier', () => {
      const issues = [
        issue('HDR-1', 'Blocked'),
        issue('HDR-2', 'Reviewed'),
        issue('HDR-3', 'Some Unknown'),
        issue('HDR-4', 'Reviewed'),
        issue('HDR-5', 'Blocked'),
        issue('HDR-6', 'Needs Review'),
        issue('HDR-7', 'Review Rejected'),
        issue('HDR-8', 'Needs Review'),
      ]
      const sorted = sortColumnIssues(issues, 'TO DO')
      expect(sorted.map((i) => i.key)).toEqual([
        'HDR-6',
        'HDR-8',
        'HDR-2',
        'HDR-4',
        'HDR-7',
        'HDR-1',
        'HDR-5',
        'HDR-3',
      ])
    })

    it('matches status case-insensitively', () => {
      const issues = [
        issue('HDR-1', 'BLOCKED'),
        issue('HDR-2', 'reviewed'),
        issue('HDR-3', 'REVIEWED'),
        issue('HDR-4', 'NEEDS REVIEW'),
        issue('HDR-5', 'review rejected'),
      ]
      const sorted = sortColumnIssues(issues, 'TO DO')
      expect(sorted.map((i) => i.key)).toEqual(['HDR-4', 'HDR-2', 'HDR-3', 'HDR-5', 'HDR-1'])
    })

    it('treats unknown statuses as the lowest tier (after Blocked)', () => {
      const issues = [
        issue('HDR-1', 'Mystery'),
        issue('HDR-2', 'Reviewed'),
        issue('HDR-3', 'Blocked'),
      ]
      const sorted = sortColumnIssues(issues, 'TO DO')
      expect(sorted.map((i) => i.key)).toEqual(['HDR-2', 'HDR-3', 'HDR-1'])
    })

    it('returns an empty array for empty input', () => {
      expect(sortColumnIssues([], 'TO DO')).toEqual([])
    })

    it('preserves input order when every issue is Reviewed', () => {
      const issues = [
        issue('HDR-1', 'Reviewed'),
        issue('HDR-2', 'Reviewed'),
        issue('HDR-3', 'Reviewed'),
      ]
      expect(sortColumnIssues(issues, 'TO DO').map((i) => i.key)).toEqual([
        'HDR-1',
        'HDR-2',
        'HDR-3',
      ])
    })

    it('preserves input order when every issue is Needs Review', () => {
      const issues = [
        issue('HDR-1', 'Needs Review'),
        issue('HDR-2', 'Needs Review'),
        issue('HDR-3', 'Needs Review'),
      ]
      expect(sortColumnIssues(issues, 'TO DO').map((i) => i.key)).toEqual([
        'HDR-1',
        'HDR-2',
        'HDR-3',
      ])
    })

    it('is stable for issues that share the same tier', () => {
      const issues = [
        issue('HDR-1', 'Blocked'),
        issue('HDR-2', 'Blocked'),
        issue('HDR-3', 'Blocked'),
      ]
      expect(sortColumnIssues(issues, 'TO DO').map((i) => i.key)).toEqual([
        'HDR-1',
        'HDR-2',
        'HDR-3',
      ])
    })
  })

  describe("column 'Done'", () => {
    it('orders by STG → QA → UAT → Done → Review Accepted with rank preserved within each group', () => {
      const issues = [
        issue('HDR-1', 'Done'),
        issue('HDR-2', 'In QA'),
        issue('HDR-3', 'In STG'),
        issue('HDR-4', 'In UAT'),
        issue('HDR-5', 'In QA'),
        issue('HDR-6', 'In STG'),
        issue('HDR-7', 'Done'),
        issue('HDR-8', 'In UAT'),
        issue('HDR-9', 'Review Accepted'),
        issue('HDR-10', 'Review Accepted'),
      ]
      const sorted = sortColumnIssues(issues, 'Done')
      expect(sorted.map((i) => i.key)).toEqual([
        'HDR-3',
        'HDR-6',
        'HDR-2',
        'HDR-5',
        'HDR-4',
        'HDR-8',
        'HDR-1',
        'HDR-7',
        'HDR-9',
        'HDR-10',
      ])
    })

    it('matches status case-insensitively', () => {
      const issues = [
        issue('HDR-1', 'DONE'),
        issue('HDR-2', 'in uat'),
        issue('HDR-3', 'In Qa'),
        issue('HDR-4', 'IN STG'),
        issue('HDR-5', 'review accepted'),
      ]
      const sorted = sortColumnIssues(issues, 'Done')
      expect(sorted.map((i) => i.key)).toEqual(['HDR-4', 'HDR-3', 'HDR-2', 'HDR-1', 'HDR-5'])
    })

    it('returns an empty array for empty input', () => {
      expect(sortColumnIssues([], 'Done')).toEqual([])
    })

    it('preserves input order when every issue shares the same status', () => {
      const issues = [issue('HDR-1', 'In STG'), issue('HDR-2', 'In STG'), issue('HDR-3', 'In STG')]
      expect(sortColumnIssues(issues, 'Done').map((i) => i.key)).toEqual([
        'HDR-1',
        'HDR-2',
        'HDR-3',
      ])
    })

    it('preserves input order when every issue is Review Accepted', () => {
      const issues = [
        issue('HDR-1', 'Review Accepted'),
        issue('HDR-2', 'Review Accepted'),
        issue('HDR-3', 'Review Accepted'),
      ]
      expect(sortColumnIssues(issues, 'Done').map((i) => i.key)).toEqual([
        'HDR-1',
        'HDR-2',
        'HDR-3',
      ])
    })

    it('is stable for issues that share the same status group', () => {
      const issues = [issue('HDR-1', 'In QA'), issue('HDR-2', 'In QA'), issue('HDR-3', 'In QA')]
      expect(sortColumnIssues(issues, 'Done').map((i) => i.key)).toEqual([
        'HDR-1',
        'HDR-2',
        'HDR-3',
      ])
    })
  })

  describe("column 'In Implementation'", () => {
    it('returns input order unchanged', () => {
      const issues = [
        issue('HDR-3', 'In Implementation'),
        issue('HDR-1', 'In Implementation'),
        issue('HDR-2', 'In Implementation'),
      ]
      expect(sortColumnIssues(issues, 'In Implementation').map((i) => i.key)).toEqual([
        'HDR-3',
        'HDR-1',
        'HDR-2',
      ])
    })

    it('returns the same reference (pass-through)', () => {
      const issues: readonly BoardIssue[] = [issue('HDR-1', 'In Implementation')]
      expect(sortColumnIssues(issues, 'In Implementation')).toBe(issues)
    })
  })

  describe("column 'In Code Review'", () => {
    it('returns input order unchanged', () => {
      const issues = [
        issue('HDR-3', 'In Code Review'),
        issue('HDR-1', 'In Code Review'),
        issue('HDR-2', 'In Code Review'),
      ]
      expect(sortColumnIssues(issues, 'In Code Review').map((i) => i.key)).toEqual([
        'HDR-3',
        'HDR-1',
        'HDR-2',
      ])
    })

    it('returns the same reference (pass-through)', () => {
      const issues: readonly BoardIssue[] = [issue('HDR-1', 'In Code Review')]
      expect(sortColumnIssues(issues, 'In Code Review')).toBe(issues)
    })
  })
})
