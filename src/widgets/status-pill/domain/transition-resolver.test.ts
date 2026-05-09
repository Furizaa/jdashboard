import { describe, expect, it } from 'vitest'
import { resolveTransition } from './transition-resolver'
import { COLUMNS, statusesForColumn, type Column } from '~/kernel'
import type { AllowedTransition } from '~/server/gateways/jira'

const ALL_STATUSES = [
  'Reviewed',
  'Blocked',
  'In Implementation',
  'In Code Review',
  'In STG',
  'In QA',
  'In UAT',
  'Done',
] as const

function transitionsTo(...names: string[]): AllowedTransition[] {
  return names.map((name, i) => ({
    id: `t-${i}`,
    name: `Move to ${name}`,
    toStatusName: name,
  }))
}

describe('resolveTransition', () => {
  describe('returns null when current status is already in target column', () => {
    it.each([
      ['Reviewed', 'TO DO'],
      ['Blocked', 'TO DO'],
      ['In Implementation', 'In Implementation'],
      ['In Code Review', 'In Code Review'],
      ['In STG', 'Done'],
      ['In QA', 'Done'],
      ['In UAT', 'Done'],
      ['Done', 'Done'],
    ] as const)('%s -> %s is null', (current, target) => {
      const all = transitionsTo(...ALL_STATUSES)
      expect(resolveTransition(current, target, all)).toBeNull()
    })
  })

  describe('cascade preference within Done column', () => {
    it('from Reviewed picks In STG when all Done statuses are reachable', () => {
      const allowed = transitionsTo('In STG', 'In QA', 'In UAT', 'Done')
      const result = resolveTransition('Reviewed', 'Done', allowed)
      expect(result?.toStatusName).toBe('In STG')
    })

    it('falls through to In QA when In STG is not reachable', () => {
      const allowed = transitionsTo('In QA', 'In UAT', 'Done')
      const result = resolveTransition('Reviewed', 'Done', allowed)
      expect(result?.toStatusName).toBe('In QA')
    })

    it('falls through to In UAT when STG and QA are not reachable', () => {
      const allowed = transitionsTo('In UAT', 'Done')
      expect(resolveTransition('Reviewed', 'Done', allowed)?.toStatusName).toBe('In UAT')
    })

    it('falls through to Done as last resort', () => {
      const allowed = transitionsTo('Done')
      expect(resolveTransition('Reviewed', 'Done', allowed)?.toStatusName).toBe('Done')
    })
  })

  describe('TO DO column prefers Reviewed over Blocked', () => {
    it('picks Reviewed when both are allowed', () => {
      const allowed = transitionsTo('Reviewed', 'Blocked')
      expect(resolveTransition('In Implementation', 'TO DO', allowed)?.toStatusName).toBe(
        'Reviewed',
      )
    })

    it('falls through to Blocked when Reviewed is not allowed', () => {
      const allowed = transitionsTo('Blocked')
      expect(resolveTransition('In Implementation', 'TO DO', allowed)?.toStatusName).toBe('Blocked')
    })
  })

  describe('single-status columns', () => {
    it('resolves In Implementation when allowed', () => {
      const allowed = transitionsTo('In Implementation')
      expect(resolveTransition('Reviewed', 'In Implementation', allowed)?.toStatusName).toBe(
        'In Implementation',
      )
    })

    it('resolves In Code Review when allowed', () => {
      const allowed = transitionsTo('In Code Review')
      expect(resolveTransition('In Implementation', 'In Code Review', allowed)?.toStatusName).toBe(
        'In Code Review',
      )
    })
  })

  describe('no valid path', () => {
    it('returns null when no allowed transition targets a status in the column', () => {
      const allowed = transitionsTo('Reviewed', 'Blocked')
      expect(resolveTransition('In Implementation', 'Done', allowed)).toBeNull()
    })

    it('returns null when allowed list is empty', () => {
      expect(resolveTransition('Reviewed', 'In Implementation', [])).toBeNull()
    })
  })

  describe('case-insensitive matching of allowed transitions', () => {
    it('matches lowercased status names', () => {
      const allowed: AllowedTransition[] = [
        { id: '1', name: 'Begin', toStatusName: 'in implementation' },
      ]
      expect(resolveTransition('Reviewed', 'In Implementation', allowed)?.toStatusName).toBe(
        'in implementation',
      )
    })

    it('matches uppercased status names (HDR mixed casing)', () => {
      const allowed: AllowedTransition[] = [{ id: '1', name: 'Done it', toStatusName: 'DONE' }]
      expect(resolveTransition('In Code Review', 'Done', allowed)?.toStatusName).toBe('DONE')
    })
  })

  describe('full table: every starting status × every column', () => {
    const allEverywhere = transitionsTo(...ALL_STATUSES)
    it.each(
      ALL_STATUSES.flatMap((status) =>
        COLUMNS.map((column) => [status, column] as [string, Column]),
      ),
    )('%s -> %s with full transition list resolves coherently', (current, target) => {
      const result = resolveTransition(current, target, allEverywhere)
      const expected = statusesForColumn(target)
      // current already in target column → null
      if (expected.some((s) => s.toLowerCase() === current.toLowerCase())) {
        expect(result).toBeNull()
      } else {
        expect(result?.toStatusName).toBe(expected[0])
      }
    })
  })
})
