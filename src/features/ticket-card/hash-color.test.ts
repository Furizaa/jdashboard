import { describe, expect, it } from 'vitest'
import { LABEL_COLOR_PALETTE, colorForLabel } from './hash-color'

describe('colorForLabel', () => {
  it('always returns a color from the fixed palette', () => {
    for (const label of ['Frontend', 'bug', 'p1', 'design-system', 'a', '']) {
      expect(LABEL_COLOR_PALETTE).toContain(colorForLabel(label))
    }
  })

  it('returns the same color for the same input on every call', () => {
    const label = 'design-system'
    const first = colorForLabel(label)
    for (let i = 0; i < 100; i++) {
      expect(colorForLabel(label)).toBe(first)
    }
  })

  it('treats different inputs independently (deterministic across labels)', () => {
    expect(colorForLabel('frontend')).toBe(colorForLabel('frontend'))
    expect(colorForLabel('Frontend')).toBe(colorForLabel('Frontend'))
  })

  it('spreads a sample of 50 distinct labels across at least 5 palette colors', () => {
    const labels = Array.from({ length: 50 }, (_, i) => `label-${i}`)
    const used = new Set(labels.map((l) => colorForLabel(l)))
    expect(used.size).toBeGreaterThanOrEqual(5)
  })
})
