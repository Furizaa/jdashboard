import { describe, expect, it } from 'vitest'
import { plainTextToAdf } from './plain-text-to-adf'

describe('plainTextToAdf', () => {
  it('wraps a single line in a paragraph node inside a doc', () => {
    expect(plainTextToAdf('hello')).toEqual({
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    })
  })

  it('emits an empty paragraph for a blank line', () => {
    expect(plainTextToAdf('a\n\nb')).toEqual({
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
      ],
    })
  })
})
