import { describe, expect, it } from 'vitest'
import {
  deriveAskModal,
  initialAskModalState,
  reduceAskModal,
  type AskModalState,
} from './ask-modal-view-model'

describe('reduceAskModal', () => {
  it('opens from closed with an empty question', () => {
    expect(reduceAskModal(initialAskModalState, { type: 'open' })).toEqual({
      status: 'open',
      question: '',
    })
  })

  it('records the typed question while open', () => {
    const open: AskModalState = { status: 'open', question: '' }
    expect(reduceAskModal(open, { type: 'setQuestion', question: 'why?' })).toEqual({
      status: 'open',
      question: 'why?',
    })
  })

  it('submits only with a non-blank question', () => {
    expect(reduceAskModal({ status: 'open', question: '   ' }, { type: 'submit' })).toEqual({
      status: 'open',
      question: '   ',
    })
    expect(reduceAskModal({ status: 'open', question: 'go?' }, { type: 'submit' })).toEqual({
      status: 'submitting',
      question: 'go?',
      priorAnswers: [],
      round: 1,
    })
  })

  it('lands the answer in the answered state, keeping the question', () => {
    const submitting: AskModalState = {
      status: 'submitting',
      question: 'go?',
      priorAnswers: [],
      round: 1,
    }
    expect(reduceAskModal(submitting, { type: 'answered', answer: 'because' })).toEqual({
      status: 'answered',
      question: 'go?',
      answer: 'because',
    })
  })

  it('goes to error on failure, keeping the question for a retry', () => {
    const submitting: AskModalState = {
      status: 'submitting',
      question: 'go?',
      priorAnswers: [],
      round: 1,
    }
    expect(reduceAskModal(submitting, { type: 'failed', message: 'boom' })).toEqual({
      status: 'error',
      question: 'go?',
      message: 'boom',
    })
  })

  it('typing after an error clears the error and returns to open', () => {
    const errored: AskModalState = { status: 'error', question: 'go?', message: 'boom' }
    expect(reduceAskModal(errored, { type: 'setQuestion', question: 'go2?' })).toEqual({
      status: 'open',
      question: 'go2?',
    })
  })

  it('ask again from the answer view reopens an empty question box', () => {
    const answered: AskModalState = { status: 'answered', question: 'go?', answer: 'because' }
    expect(reduceAskModal(answered, { type: 'askAgain' })).toEqual({ status: 'open', question: '' })
  })

  it('closes on explicit close', () => {
    const answered: AskModalState = { status: 'answered', question: 'go?', answer: 'because' }
    expect(reduceAskModal(answered, { type: 'close' })).toEqual({ status: 'closed' })
  })
})

describe('reduceAskModal — grilling', () => {
  const question = {
    id: 'which',
    title: 'Which one?',
    body: '',
    options: [{ id: 'a', label: 'A', recommended: true as const }],
    allowFreeText: true,
  }
  const submitting: AskModalState = {
    status: 'submitting',
    question: 'go?',
    priorAnswers: [],
    round: 1,
  }

  it('enters grilling when the agent asks questions', () => {
    expect(
      reduceAskModal(submitting, { type: 'gotQuestions', questions: [question], round: 1 }),
    ).toEqual({
      status: 'grilling',
      question: 'go?',
      priorAnswers: [],
      round: 1,
      questions: [question],
      answers: [],
    })
  })

  it('re-submits with accumulated answers and a bumped round', () => {
    const grilling: AskModalState = {
      status: 'grilling',
      question: 'go?',
      priorAnswers: [{ question: 'Q0', answer: 'A0' }],
      round: 1,
      questions: [question],
      answers: [],
    }
    const priorAnswers = [
      { question: 'Q0', answer: 'A0' },
      { question: 'Which one?', answer: 'A' },
    ]
    expect(reduceAskModal(grilling, { type: 'submitAnswers', priorAnswers })).toEqual({
      status: 'submitting',
      question: 'go?',
      priorAnswers,
      round: 2,
    })
  })
})

describe('deriveAskModal', () => {
  it('is not open when closed', () => {
    expect(deriveAskModal({ status: 'closed' })).toEqual({ open: false })
  })

  it('can submit only with a non-blank question', () => {
    expect(deriveAskModal({ status: 'open', question: '' })).toMatchObject({ canSubmit: false })
    expect(deriveAskModal({ status: 'open', question: 'x' })).toMatchObject({ canSubmit: true })
  })

  it('exposes submitting and disables submit mid-flight', () => {
    expect(
      deriveAskModal({ status: 'submitting', question: 'x', priorAnswers: [], round: 1 }),
    ).toMatchObject({ view: 'input', submitting: true, canSubmit: false })
  })

  it('exposes the grilling view with questions and answers', () => {
    const question = { id: 'q', title: 'T', body: '', options: [], allowFreeText: true }
    expect(
      deriveAskModal({
        status: 'grilling',
        question: 'go?',
        priorAnswers: [],
        round: 2,
        questions: [question],
        answers: [],
      }),
    ).toMatchObject({ open: true, view: 'grilling', round: 2, questions: [question] })
  })

  it('exposes the answer view with the answer text', () => {
    expect(
      deriveAskModal({ status: 'answered', question: 'go?', answer: 'because' }),
    ).toMatchObject({
      open: true,
      view: 'answer',
      question: 'go?',
      answer: 'because',
    })
  })

  it('surfaces the error message and re-enables submit', () => {
    expect(deriveAskModal({ status: 'error', question: 'x', message: 'boom' })).toMatchObject({
      error: 'boom',
      canSubmit: true,
    })
  })
})
