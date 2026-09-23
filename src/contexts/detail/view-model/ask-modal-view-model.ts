import { match } from 'ts-pattern'
import type { RefineAnswer, RefineClarification, RefineQuestion } from '~/kernel'

// Framework-free state machine for the Ask modal: the user types a question, submits,
// and a headless read-only agent answers. When the question is ambiguous the agent
// asks clarifying questions first (`grilling`); the user answers, we re-submit with
// the answers folded in, and the loop repeats until the agent returns the answer.
// Sibling of `refine-modal-view-model.ts`; the one shape difference is that success
// lands in `answered` (holding the answer for display) instead of closing — Ask never
// writes, so the result lives in the modal, not on disk. No React, no I/O here.

export type AskModalState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly question: string }
  // `priorAnswers` / `round` carry across the grilling loop so a re-submit after
  // answering keeps every earlier round's clarifications.
  | {
      readonly status: 'submitting'
      readonly question: string
      readonly priorAnswers: readonly RefineClarification[]
      readonly round: number
    }
  | {
      readonly status: 'grilling'
      readonly question: string
      readonly priorAnswers: readonly RefineClarification[]
      readonly round: number
      readonly questions: readonly RefineQuestion[]
      readonly answers: readonly RefineAnswer[]
    }
  | { readonly status: 'answered'; readonly question: string; readonly answer: string }
  | { readonly status: 'error'; readonly question: string; readonly message: string }

export const initialAskModalState: AskModalState = { status: 'closed' }

export type AskModalEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'setQuestion'; question: string }
  | { type: 'submit' }
  // The agent asked questions instead of answering.
  | { type: 'gotQuestions'; questions: readonly RefineQuestion[]; round: number }
  // The user edited their answer draft in the grilling step.
  | { type: 'setAnswers'; answers: readonly RefineAnswer[] }
  // The user submitted the round's answers; `priorAnswers` is the full accumulated set.
  | { type: 'submitAnswers'; priorAnswers: readonly RefineClarification[] }
  | { type: 'answered'; answer: string }
  | { type: 'failed'; message: string }
  // From the answer view: ask a fresh question in the same modal.
  | { type: 'askAgain' }

export function reduceAskModal(state: AskModalState, event: AskModalEvent): AskModalState {
  return (
    match(event)
      .with({ type: 'open' }, (): AskModalState => ({ status: 'open', question: '' }))
      // Close returns to closed; a mid-flight close abandons the in-flight ask's UI
      // (the request itself still completes server-side — it just writes nothing).
      .with({ type: 'close' }, (): AskModalState => ({ status: 'closed' }))
      // From the answer view, start over with an empty question box.
      .with({ type: 'askAgain' }, (): AskModalState => ({ status: 'open', question: '' }))
      // Typing is allowed while open or after an error (which clears the error);
      // ignored mid-submit and during grilling (there's no textarea then).
      .with(
        { type: 'setQuestion' },
        ({ question }): AskModalState =>
          match(state)
            .with(
              { status: 'open' },
              { status: 'error' },
              () => ({ status: 'open', question }) as const,
            )
            .otherwise(() => state),
      )
      // First submit: round 1, no prior answers. The presenter also guards.
      .with(
        { type: 'submit' },
        (): AskModalState =>
          state.status === 'open' && state.question.trim() !== ''
            ? { status: 'submitting', question: state.question, priorAnswers: [], round: 1 }
            : state,
      )
      .with(
        { type: 'gotQuestions' },
        ({ questions, round }): AskModalState =>
          state.status === 'submitting'
            ? {
                status: 'grilling',
                question: state.question,
                priorAnswers: state.priorAnswers,
                round,
                questions,
                answers: [],
              }
            : state,
      )
      .with(
        { type: 'setAnswers' },
        ({ answers }): AskModalState =>
          state.status === 'grilling' ? { ...state, answers } : state,
      )
      // Re-submit with this round's answers folded in; bump the round.
      .with(
        { type: 'submitAnswers' },
        ({ priorAnswers }): AskModalState =>
          state.status === 'grilling'
            ? {
                status: 'submitting',
                question: state.question,
                priorAnswers,
                round: state.round + 1,
              }
            : state,
      )
      .with(
        { type: 'answered' },
        ({ answer }): AskModalState =>
          state.status === 'submitting'
            ? { status: 'answered', question: state.question, answer }
            : state,
      )
      .with(
        { type: 'failed' },
        ({ message }): AskModalState =>
          state.status === 'submitting'
            ? { status: 'error', question: state.question, message }
            : state,
      )
      .exhaustive()
  )
}

export type AskModalDisplay =
  | { readonly open: false }
  | {
      readonly open: true
      readonly view: 'input'
      readonly question: string
      readonly submitting: boolean
      readonly canSubmit: boolean
      readonly error: string | null
    }
  | {
      readonly open: true
      readonly view: 'grilling'
      readonly questions: readonly RefineQuestion[]
      readonly answers: readonly RefineAnswer[]
      readonly round: number
    }
  | {
      readonly open: true
      readonly view: 'answer'
      readonly question: string
      readonly answer: string
    }

export function deriveAskModal(state: AskModalState): AskModalDisplay {
  return match(state)
    .with({ status: 'closed' }, () => ({ open: false }) as const)
    .with({ status: 'open' }, ({ question }) => ({
      open: true as const,
      view: 'input' as const,
      question,
      submitting: false,
      canSubmit: question.trim() !== '',
      error: null,
    }))
    .with({ status: 'submitting' }, ({ question }) => ({
      open: true as const,
      view: 'input' as const,
      question,
      submitting: true,
      canSubmit: false,
      error: null,
    }))
    .with({ status: 'grilling' }, ({ questions, answers, round }) => ({
      open: true as const,
      view: 'grilling' as const,
      questions,
      answers,
      round,
    }))
    .with({ status: 'answered' }, ({ question, answer }) => ({
      open: true as const,
      view: 'answer' as const,
      question,
      answer,
    }))
    .with({ status: 'error' }, ({ question, message }) => ({
      open: true as const,
      view: 'input' as const,
      question,
      submitting: false,
      canSubmit: question.trim() !== '',
      error: message,
    }))
    .exhaustive()
}
