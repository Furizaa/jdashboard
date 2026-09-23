import { describe, expect, it } from 'vitest'
import { validateBoardSearch } from './-app-shell'

// Both board routes share this schema, so a deep-link behaves identically on
// `/` and `/watchlist`. Search params arrive from the URL, so everything here is
// hostile input until proven otherwise.
describe('validateBoardSearch', () => {
  it('takes an issue key as the one thing that stands on its own', () => {
    expect(validateBoardSearch({ issue: 'HDR-1' })).toEqual({
      issue: 'HDR-1',
      notes: undefined,
      ai: undefined,
    })
  })

  it('rejects a blank or non-string issue', () => {
    expect(validateBoardSearch({ issue: '   ' }).issue).toBeUndefined()
    expect(validateBoardSearch({ issue: 42 }).issue).toBeUndefined()
    expect(validateBoardSearch({}).issue).toBeUndefined()
  })

  it('accepts notes as a boolean or the string a URL actually carries', () => {
    expect(validateBoardSearch({ issue: 'HDR-1', notes: true }).notes).toBe(true)
    expect(validateBoardSearch({ issue: 'HDR-1', notes: 'true' }).notes).toBe(true)
  })

  it('drops notes without an issue — there is no note without a ticket', () => {
    expect(validateBoardSearch({ notes: true }).notes).toBeUndefined()
  })

  it('accepts the two AI modals and nothing else', () => {
    expect(validateBoardSearch({ issue: 'HDR-1', ai: 'refine' }).ai).toBe('refine')
    expect(validateBoardSearch({ issue: 'HDR-1', ai: 'ask' }).ai).toBe('ask')
    expect(validateBoardSearch({ issue: 'HDR-1', ai: 'REFINE' }).ai).toBeUndefined()
    expect(validateBoardSearch({ issue: 'HDR-1', ai: 'delete-everything' }).ai).toBeUndefined()
    expect(validateBoardSearch({ issue: 'HDR-1', ai: true }).ai).toBeUndefined()
  })

  it('drops ai without an issue, like notes', () => {
    expect(validateBoardSearch({ ai: 'refine' }).ai).toBeUndefined()
  })

  it('implies the notes pane, since that is where both AI modals are mounted', () => {
    // A hand-typed `?issue=X&ai=refine` would otherwise point at a modal that
    // is not rendered.
    expect(validateBoardSearch({ issue: 'HDR-1', ai: 'ask' })).toEqual({
      issue: 'HDR-1',
      notes: true,
      ai: 'ask',
    })
  })

  it('ignores unknown params rather than passing them through', () => {
    expect(validateBoardSearch({ issue: 'HDR-1', nonsense: 'x' })).toEqual({
      issue: 'HDR-1',
      notes: undefined,
      ai: undefined,
    })
  })
})
