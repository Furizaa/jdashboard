import { describe, expect, it } from 'vitest'
import { canSubmitDraft, initialState, reduce, type State } from './tag-manager-view-model'

describe('tag manager reduce', () => {
  it('opens and closes', () => {
    const opened = reduce(initialState, { type: 'opened' })
    expect(opened.open).toBe(true)
    expect(reduce(opened, { type: 'closed' })).toEqual(initialState)
  })

  it('closing resets the draft', () => {
    const dirty: State = { open: true, draftName: 'wip', draftColorId: 'red' }
    expect(reduce(dirty, { type: 'closed' })).toEqual(initialState)
  })

  it('tracks the draft name and colour', () => {
    let state = reduce(initialState, { type: 'opened' })
    state = reduce(state, { type: 'draftNameChanged', name: 'Blocked' })
    state = reduce(state, { type: 'draftColorChanged', colorId: 'critical' })
    expect(state.draftName).toBe('Blocked')
    expect(state.draftColorId).toBe('critical')
  })

  it('submitting clears the name but keeps the chosen colour', () => {
    const state: State = { open: true, draftName: 'Blocked', draftColorId: 'critical' }
    const next = reduce(state, { type: 'draftSubmitted' })
    expect(next.draftName).toBe('')
    expect(next.draftColorId).toBe('critical')
    expect(next.open).toBe(true)
  })
})

describe('canSubmitDraft', () => {
  it('is false for blank / whitespace names, true otherwise', () => {
    expect(canSubmitDraft({ open: true, draftName: '', draftColorId: 'blue' })).toBe(false)
    expect(canSubmitDraft({ open: true, draftName: '   ', draftColorId: 'blue' })).toBe(false)
    expect(canSubmitDraft({ open: true, draftName: 'x', draftColorId: 'blue' })).toBe(true)
  })
})
