import { describe, expect, it } from 'vitest'
import { ciVisualState } from './ci-state'

describe('ciVisualState', () => {
  describe('conflict precedence', () => {
    it('returns conflict when hasConflicts is true regardless of pipeline status', () => {
      const statuses: Array<string | null> = [
        null,
        'success',
        'running',
        'pending',
        'failed',
        'canceled',
        'skipped',
        'manual',
      ]
      for (const headPipelineStatus of statuses) {
        expect(ciVisualState({ headPipelineStatus, hasConflicts: true })).toBe('conflict')
      }
    })
  })

  describe('without conflict', () => {
    it('null pipeline → none', () => {
      expect(ciVisualState({ headPipelineStatus: null, hasConflicts: false })).toBe('none')
    })

    it('success → passed', () => {
      expect(ciVisualState({ headPipelineStatus: 'success', hasConflicts: false })).toBe('passed')
    })

    it('running → running', () => {
      expect(ciVisualState({ headPipelineStatus: 'running', hasConflicts: false })).toBe('running')
    })

    it('pending → running', () => {
      expect(ciVisualState({ headPipelineStatus: 'pending', hasConflicts: false })).toBe('running')
    })

    it('failed → failed', () => {
      expect(ciVisualState({ headPipelineStatus: 'failed', hasConflicts: false })).toBe('failed')
    })

    it('canceled → failed', () => {
      expect(ciVisualState({ headPipelineStatus: 'canceled', hasConflicts: false })).toBe('failed')
    })

    it('skipped → none', () => {
      expect(ciVisualState({ headPipelineStatus: 'skipped', hasConflicts: false })).toBe('none')
    })

    it('unknown status → none', () => {
      expect(ciVisualState({ headPipelineStatus: 'manual', hasConflicts: false })).toBe('none')
      expect(ciVisualState({ headPipelineStatus: 'created', hasConflicts: false })).toBe('none')
      expect(ciVisualState({ headPipelineStatus: 'whatever', hasConflicts: false })).toBe('none')
    })
  })
})
