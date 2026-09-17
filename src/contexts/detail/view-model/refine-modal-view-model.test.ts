import { describe, expect, it } from 'vitest'
import {
  deriveRefineModal,
  initialRefineModalState,
  reduceRefineModal,
  type RefineModalState,
} from './refine-modal-view-model'

describe('reduceRefineModal', () => {
  it('opens from closed with an empty draft', () => {
    expect(reduceRefineModal(initialRefineModalState, { type: 'open' })).toEqual({
      status: 'open',
      text: '',
    })
  })

  it('records typed text while open', () => {
    const open: RefineModalState = { status: 'open', text: '' }
    expect(reduceRefineModal(open, { type: 'setText', text: 'hi' })).toEqual({
      status: 'open',
      text: 'hi',
    })
  })

  it('submits only with non-blank text', () => {
    expect(reduceRefineModal({ status: 'open', text: '   ' }, { type: 'submit' })).toEqual({
      status: 'open',
      text: '   ',
    })
    expect(reduceRefineModal({ status: 'open', text: 'go' }, { type: 'submit' })).toEqual({
      status: 'submitting',
      text: 'go',
    })
  })

  it('goes to error on failure, keeping the text for a retry', () => {
    const submitting: RefineModalState = { status: 'submitting', text: 'go' }
    expect(reduceRefineModal(submitting, { type: 'failed', message: 'boom' })).toEqual({
      status: 'error',
      text: 'go',
      message: 'boom',
    })
  })

  it('typing after an error clears the error and returns to open', () => {
    const errored: RefineModalState = { status: 'error', text: 'go', message: 'boom' }
    expect(reduceRefineModal(errored, { type: 'setText', text: 'go2' })).toEqual({
      status: 'open',
      text: 'go2',
    })
  })

  it('ignores typing mid-submit (the textarea is disabled)', () => {
    const submitting: RefineModalState = { status: 'submitting', text: 'go' }
    expect(reduceRefineModal(submitting, { type: 'setText', text: 'x' })).toEqual(submitting)
  })

  it('closes on success and on explicit close', () => {
    const submitting: RefineModalState = { status: 'submitting', text: 'go' }
    expect(reduceRefineModal(submitting, { type: 'succeeded' })).toEqual({ status: 'closed' })
    expect(reduceRefineModal(submitting, { type: 'close' })).toEqual({ status: 'closed' })
  })
})

describe('deriveRefineModal', () => {
  it('is not open when closed', () => {
    expect(deriveRefineModal({ status: 'closed' })).toEqual({ open: false })
  })

  it('can submit only with non-blank text', () => {
    expect(deriveRefineModal({ status: 'open', text: '' })).toMatchObject({ canSubmit: false })
    expect(deriveRefineModal({ status: 'open', text: 'x' })).toMatchObject({ canSubmit: true })
  })

  it('exposes submitting and disables submit mid-flight', () => {
    expect(deriveRefineModal({ status: 'submitting', text: 'x' })).toMatchObject({
      submitting: true,
      canSubmit: false,
    })
  })

  it('surfaces the error message and re-enables submit', () => {
    expect(deriveRefineModal({ status: 'error', text: 'x', message: 'boom' })).toMatchObject({
      error: 'boom',
      canSubmit: true,
    })
  })
})
