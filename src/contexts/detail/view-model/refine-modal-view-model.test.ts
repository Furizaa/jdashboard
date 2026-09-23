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
      priorAnswers: [],
      round: 1,
    })
  })

  it('goes to error on failure, keeping the text for a retry', () => {
    const submitting: RefineModalState = {
      status: 'submitting',
      text: 'go',
      priorAnswers: [],
      round: 1,
    }
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
    const submitting: RefineModalState = {
      status: 'submitting',
      text: 'go',
      priorAnswers: [],
      round: 1,
    }
    expect(reduceRefineModal(submitting, { type: 'setText', text: 'x' })).toEqual(submitting)
  })

  it('closes on success and on explicit close', () => {
    const submitting: RefineModalState = {
      status: 'submitting',
      text: 'go',
      priorAnswers: [],
      round: 1,
    }
    expect(reduceRefineModal(submitting, { type: 'succeeded' })).toEqual({ status: 'closed' })
    expect(reduceRefineModal(submitting, { type: 'close' })).toEqual({ status: 'closed' })
  })
})

describe('reduceRefineModal — grilling', () => {
  const question = {
    id: 'owner',
    title: 'Who owns it?',
    body: '',
    options: [{ id: 'ada', label: 'Ada', recommended: true as const }],
    allowFreeText: true,
  }
  const submitting: RefineModalState = {
    status: 'submitting',
    text: 'go',
    priorAnswers: [],
    round: 1,
  }

  it('enters grilling when the agent asks questions', () => {
    expect(
      reduceRefineModal(submitting, { type: 'gotQuestions', questions: [question], round: 1 }),
    ).toEqual({
      status: 'grilling',
      text: 'go',
      priorAnswers: [],
      round: 1,
      questions: [question],
      answers: [],
    })
  })

  it('records the answer draft while grilling', () => {
    const grilling: RefineModalState = {
      status: 'grilling',
      text: 'go',
      priorAnswers: [],
      round: 1,
      questions: [question],
      answers: [],
    }
    const answers = [{ questionId: 'owner', optionId: 'ada' }]
    expect(reduceRefineModal(grilling, { type: 'setAnswers', answers })).toMatchObject({
      status: 'grilling',
      answers,
    })
  })

  it('re-submits with accumulated answers and a bumped round', () => {
    const grilling: RefineModalState = {
      status: 'grilling',
      text: 'go',
      priorAnswers: [{ question: 'Q0', answer: 'A0' }],
      round: 1,
      questions: [question],
      answers: [],
    }
    const priorAnswers = [
      { question: 'Q0', answer: 'A0' },
      { question: 'Who owns it?', answer: 'Ada' },
    ]
    expect(reduceRefineModal(grilling, { type: 'submitAnswers', priorAnswers })).toEqual({
      status: 'submitting',
      text: 'go',
      priorAnswers,
      round: 2,
    })
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
    expect(
      deriveRefineModal({ status: 'submitting', text: 'x', priorAnswers: [], round: 1 }),
    ).toMatchObject({
      view: 'input',
      submitting: true,
      canSubmit: false,
    })
  })

  it('exposes the grilling view with questions and answers', () => {
    const question = { id: 'q', title: 'T', body: '', options: [], allowFreeText: true }
    expect(
      deriveRefineModal({
        status: 'grilling',
        text: 'go',
        priorAnswers: [],
        round: 2,
        questions: [question],
        answers: [],
      }),
    ).toMatchObject({ open: true, view: 'grilling', round: 2, questions: [question] })
  })

  it('surfaces the error message and re-enables submit', () => {
    expect(deriveRefineModal({ status: 'error', text: 'x', message: 'boom' })).toMatchObject({
      error: 'boom',
      canSubmit: true,
    })
  })
})
