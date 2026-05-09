import { describe, expect, it } from 'vitest'
import { extractPlainText } from './extract-plain-text'

describe('extractPlainText', () => {
  it('returns empty string for null', () => {
    expect(extractPlainText(null)).toBe('')
  })

  it('extracts text from a single paragraph', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }],
    }
    expect(extractPlainText(doc)).toBe('Hello world')
  })

  it('separates block-level nodes with newlines', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second' }] },
      ],
    }
    expect(extractPlainText(doc)).toBe('First\nSecond')
  })

  it('preserves text marks (concatenates underlying text values)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold ' },
            { type: 'text', text: 'and italic', marks: [{ type: 'em' }] },
          ],
        },
      ],
    }
    expect(extractPlainText(doc)).toBe('Bold and italic')
  })

  it('handles nested lists', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }],
            },
          ],
        },
      ],
    }
    expect(extractPlainText(doc)).toBe('a\nb')
  })

  it('inserts newline for hardBreak', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'line 1' },
            { type: 'hardBreak' },
            { type: 'text', text: 'line 2' },
          ],
        },
      ],
    }
    expect(extractPlainText(doc)).toBe('line 1\nline 2')
  })

  it('returns empty string for an empty doc', () => {
    expect(extractPlainText({ type: 'doc', content: [] })).toBe('')
  })
})
