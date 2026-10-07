import { describe, expect, it } from 'vitest'
import { validateExplainSearch } from './explain-search'

// The URL is hostile input. Every malformed form is *dropped*, never rejected —
// a bad link lands on the review list rather than on an error page.

describe('validateExplainSearch — ?mr=', () => {
  it('takes an iid as a number and as the string a pasted link carries', () => {
    expect(validateExplainSearch({ mr: 123 }).mr).toBe(123)
    expect(validateExplainSearch({ mr: '123' }).mr).toBe(123)
    expect(validateExplainSearch({ mr: '  123  ' }).mr).toBe(123)
  })

  it.each([
    ['absent', {}],
    ['zero', { mr: 0 }],
    ['negative', { mr: -1 }],
    ['fractional', { mr: 1.5 }],
    ['leading zero', { mr: '01' }],
    ['exponential', { mr: 1e21 }],
    ['not a number', { mr: 'abc' }],
    ['empty', { mr: '' }],
    ['NaN', { mr: Number.NaN }],
    ['a boolean', { mr: true }],
    ['null', { mr: null }],
  ])('drops a %s iid', (_label, search) => {
    expect(validateExplainSearch(search).mr).toBeUndefined()
  })
})

describe('validateExplainSearch — ?move=', () => {
  it('keeps a slug-shaped move alongside its merge request', () => {
    expect(validateExplainSearch({ mr: 1, move: 'rounding-leaves-pricing' })).toEqual({
      mr: 1,
      move: 'rounding-leaves-pricing',
    })
  })

  it.each([
    ['upper case', 'Rounding'],
    ['underscored', 'rounding_leaves'],
    ['leading hyphen', '-rounding'],
    ['double hyphen', 'rounding--leaves'],
    ['spaced', 'rounding leaves'],
    ['over-long', 'a'.repeat(81)],
    ['empty', ''],
  ])('drops a %s move but keeps the merge request', (_label, move) => {
    expect(validateExplainSearch({ mr: 1, move })).toEqual({ mr: 1, move: undefined })
  })

  it('drops a move that names no merge request — it identifies nothing alone', () => {
    expect(validateExplainSearch({ move: 'rounding-leaves-pricing' })).toEqual({
      mr: undefined,
      move: undefined,
    })
  })
})
