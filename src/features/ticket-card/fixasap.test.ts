import { describe, expect, it } from 'vitest'
import { hasFixasapLabel } from './fixasap'

describe('hasFixasapLabel', () => {
  it('matches exact FIXASAP', () => {
    expect(hasFixasapLabel(['FIXASAP'])).toBe(true)
  })

  it('matches lowercase fixasap', () => {
    expect(hasFixasapLabel(['fixasap'])).toBe(true)
  })

  it('matches mixed case FixAsap', () => {
    expect(hasFixasapLabel(['FixAsap'])).toBe(true)
  })

  it('matches mixed case fixASAP', () => {
    expect(hasFixasapLabel(['fixASAP'])).toBe(true)
  })

  it('does not match URGENT', () => {
    expect(hasFixasapLabel(['URGENT'])).toBe(false)
  })

  it('does not match FIX-ASAP', () => {
    expect(hasFixasapLabel(['FIX-ASAP'])).toBe(false)
  })

  it('does not match FIX_ASAP', () => {
    expect(hasFixasapLabel(['FIX_ASAP'])).toBe(false)
  })

  it('does not match FIXASAPS', () => {
    expect(hasFixasapLabel(['FIXASAPS'])).toBe(false)
  })

  it('does not match FIXAS', () => {
    expect(hasFixasapLabel(['FIXAS'])).toBe(false)
  })

  it('returns false for empty list', () => {
    expect(hasFixasapLabel([])).toBe(false)
  })

  it('returns true when one of multiple labels matches', () => {
    expect(hasFixasapLabel(['frontend', 'fixasap', 'bug'])).toBe(true)
  })
})
