import { describe, expect, it } from 'vitest'
import { parseQuestions } from './refine-grilling'

describe('parseQuestions', () => {
  it('returns null for a non-array', () => {
    expect(parseQuestions(undefined)).toBeNull()
    expect(parseQuestions({})).toBeNull()
  })

  it('returns null when nothing usable survives', () => {
    expect(parseQuestions([])).toBeNull()
    expect(parseQuestions([{}, { title: '   ', body: '' }])).toBeNull()
  })

  it('keeps a well-formed question with its options and recommended flag', () => {
    const parsed = parseQuestions([
      {
        id: 'owner',
        title: 'Who owns it?',
        body: 'Both volunteered.',
        options: [
          { id: 'ada', label: 'Ada', recommended: true },
          { id: 'grace', label: 'Grace' },
        ],
        allowFreeText: true,
      },
    ])
    expect(parsed).toEqual([
      {
        id: 'owner',
        title: 'Who owns it?',
        body: 'Both volunteered.',
        options: [
          { id: 'ada', label: 'Ada', recommended: true },
          { id: 'grace', label: 'Grace' },
        ],
        allowFreeText: true,
      },
    ])
  })

  it('synthesises ids and forces free text when a question has no options', () => {
    const parsed = parseQuestions([{ title: 'Anything else?' }])
    expect(parsed).not.toBeNull()
    expect(parsed?.[0]).toMatchObject({ id: 'q1', title: 'Anything else?', allowFreeText: true })
    expect(parsed?.[0]?.options).toEqual([])
  })

  it('keeps only the first recommended option and drops label-less options', () => {
    const parsed = parseQuestions([
      {
        title: 'Pick',
        options: [
          { id: 'a', label: 'A', recommended: true },
          { id: 'b', label: 'B', recommended: true },
          { id: 'c', label: '' },
        ],
      },
    ])
    const options = parsed?.[0]?.options ?? []
    expect(options).toHaveLength(2)
    expect(options.filter((o) => o.recommended)).toHaveLength(1)
    expect(options[0]?.recommended).toBe(true)
  })

  it('respects allowFreeText:false when options are present', () => {
    const parsed = parseQuestions([
      { title: 'Pick one', options: [{ id: 'a', label: 'A' }], allowFreeText: false },
    ])
    expect(parsed?.[0]?.allowFreeText).toBe(false)
  })

  it('uses the body as the title when only a body is given', () => {
    const parsed = parseQuestions([{ body: 'What did they decide?' }])
    expect(parsed?.[0]).toMatchObject({ title: 'What did they decide?', body: '' })
  })
})
