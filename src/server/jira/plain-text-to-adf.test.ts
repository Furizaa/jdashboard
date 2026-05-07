import { describe, expect, it } from 'vitest'
import { plainTextToAdf } from './plain-text-to-adf'

describe('plainTextToAdf', () => {
  it('wraps in a doc node with type "doc" and version 1', () => {
    const result = plainTextToAdf('hello')
    expect(result.type).toBe('doc')
    expect(result.version).toBe(1)
  })

  it('maps empty string to a single empty paragraph', () => {
    const result = plainTextToAdf('')
    expect(result.content).toEqual([{ type: 'paragraph' }])
  })

  it('maps single line to one paragraph with one text node', () => {
    const result = plainTextToAdf('hello world')
    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
    ])
  })

  it('maps multi-line input to N paragraphs, one per line', () => {
    const result = plainTextToAdf('line one\nline two\nline three')
    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'line one' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'line two' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'line three' }] },
    ])
  })

  it('preserves empty lines between content as empty paragraphs', () => {
    const result = plainTextToAdf('a\n\nb')
    expect(result.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
      { type: 'paragraph' },
      { type: 'paragraph', content: [{ type: 'text', text: 'b' }] },
    ])
  })
})
