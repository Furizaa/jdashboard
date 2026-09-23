import { describe, expect, it } from 'vitest'
import { mrPriorityFromLabels } from './priority'

describe('mrPriorityFromLabels', () => {
  it('reads each known priority::<value> scoped label', () => {
    expect(mrPriorityFromLabels(['priority::hotfix'])).toBe('hotfix')
    expect(mrPriorityFromLabels(['priority::high'])).toBe('high')
    expect(mrPriorityFromLabels(['priority::normal'])).toBe('normal')
    expect(mrPriorityFromLabels(['priority::low'])).toBe('low')
  })

  it('returns null when no priority label is present', () => {
    expect(mrPriorityFromLabels([])).toBeNull()
    expect(mrPriorityFromLabels(['backend', 'needs-qa'])).toBeNull()
  })

  it('ignores an unknown value under the priority scope', () => {
    expect(mrPriorityFromLabels(['priority::urgent'])).toBeNull()
  })

  it('matches case-insensitively', () => {
    expect(mrPriorityFromLabels(['Priority::High'])).toBe('high')
  })

  it('picks the priority label out of a mixed label set', () => {
    expect(mrPriorityFromLabels(['backend', 'priority::high', 'needs-qa'])).toBe('high')
  })
})
