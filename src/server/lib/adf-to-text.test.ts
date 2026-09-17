import { describe, expect, it } from 'vitest'
import type { AdfNode } from '../gateways/jira/types'
import { adfToText } from './adf-to-text'

const doc = (...content: AdfNode[]): AdfNode => ({ type: 'doc', content })
const para = (...text: string[]): AdfNode => ({
  type: 'paragraph',
  content: text.map((t) => ({ type: 'text', text: t })),
})

describe('adfToText', () => {
  it('returns the empty string for null or undefined', () => {
    expect(adfToText(null)).toBe('')
    expect(adfToText(undefined)).toBe('')
  })

  it('joins block nodes with newlines', () => {
    expect(adfToText(doc(para('first'), para('second')))).toBe('first\nsecond')
  })

  it('concatenates inline text within a block', () => {
    expect(adfToText(doc(para('a ', 'b ', 'c')))).toBe('a b c')
  })

  it('turns a hardBreak into a newline inside a paragraph', () => {
    expect(
      adfToText(
        doc({
          type: 'paragraph',
          content: [
            { type: 'text', text: 'a' },
            { type: 'hardBreak' },
            { type: 'text', text: 'b' },
          ],
        }),
      ),
    ).toBe('a\nb')
  })

  it('walks nested lists, emitting one line per list item', () => {
    const list: AdfNode = {
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [para('one')] },
        { type: 'listItem', content: [para('two')] },
      ],
    }
    expect(adfToText(doc(list))).toBe('one\ntwo')
  })

  it('trims leading and trailing blank lines', () => {
    expect(adfToText(doc(para(''), para('body'), para('')))).toBe('body')
  })
})
