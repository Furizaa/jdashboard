import { describe, expect, it } from 'vitest'
import { reviewerVisualState } from './reviewer-state'

describe('reviewerVisualState', () => {
  it('unreviewed with no notes → gray-dashed', () => {
    expect(reviewerVisualState('unreviewed', false, 0)).toBe('gray-dashed')
    expect(reviewerVisualState('unreviewed', false, 5)).toBe('gray-dashed')
  })

  it('unreviewed with notes from this reviewer → blue-dashed (the upgrade)', () => {
    expect(reviewerVisualState('unreviewed', true, 0)).toBe('blue-dashed')
    expect(reviewerVisualState('unreviewed', true, 7)).toBe('blue-dashed')
  })

  it('reviewed → blue-dashed regardless of notes flag', () => {
    expect(reviewerVisualState('reviewed', false, 0)).toBe('blue-dashed')
    expect(reviewerVisualState('reviewed', true, 0)).toBe('blue-dashed')
  })

  it('requested_changes → red-solid regardless of other signals', () => {
    expect(reviewerVisualState('requested_changes', false, 0)).toBe('red-solid')
    expect(reviewerVisualState('requested_changes', true, 4)).toBe('red-solid')
  })

  it('approved with zero unresolved-from-others → green-solid', () => {
    expect(reviewerVisualState('approved', false, 0)).toBe('green-solid')
    expect(reviewerVisualState('approved', true, 0)).toBe('green-solid')
  })

  it('approved with at least one unresolved-from-others → green-dashed', () => {
    expect(reviewerVisualState('approved', false, 1)).toBe('green-dashed')
    expect(reviewerVisualState('approved', true, 12)).toBe('green-dashed')
  })
})
