import { match } from 'ts-pattern'
import type { RefineAnswer, RefineClarification, RefineQuestion } from '~/kernel'

// Framework-free state machine for the Refine modal: the user pastes text (a
// transcript or an instruction), submits, and a headless agent rewrites the note.
// When the transcript is ambiguous the agent asks clarifying questions first
// (`grilling`); the user answers, we re-submit with the answers folded in, and the
// loop repeats until the agent returns the note. The reducer owns the lifecycle;
// the presenter (`use-refine-modal.ts`) wires the refine mutation and turns its
// resolution into dispatches. No React, no I/O here.

export type RefineModalState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly text: string }
  // `priorAnswers` / `round` carry across the grilling loop so a re-submit after
  // answering keeps every earlier round's clarifications.
  | {
      readonly status: 'submitting'
      readonly text: string
      readonly priorAnswers: readonly RefineClarification[]
      readonly round: number
    }
  | {
      readonly status: 'grilling'
      readonly text: string
      readonly priorAnswers: readonly RefineClarification[]
      readonly round: number
      readonly questions: readonly RefineQuestion[]
      readonly answers: readonly RefineAnswer[]
    }
  | { readonly status: 'error'; readonly text: string; readonly message: string }

export const initialRefineModalState: RefineModalState = { status: 'closed' }

export type RefineModalEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'setText'; text: string }
  | { type: 'submit' }
  // The agent asked questions instead of returning a note.
  | { type: 'gotQuestions'; questions: readonly RefineQuestion[]; round: number }
  // The user edited their answer draft in the grilling step.
  | { type: 'setAnswers'; answers: readonly RefineAnswer[] }
  // The user submitted the round's answers; `priorAnswers` is the full accumulated
  // set (earlier rounds + this round's resolved answers).
  | { type: 'submitAnswers'; priorAnswers: readonly RefineClarification[] }
  | { type: 'succeeded' }
  | { type: 'failed'; message: string }

export function reduceRefineModal(
  state: RefineModalState,
  event: RefineModalEvent,
): RefineModalState {
  return (
    match(event)
      .with({ type: 'open' }, (): RefineModalState => ({ status: 'open', text: '' }))
      // Close and success both return to closed; a mid-flight close abandons the
      // in-flight refine's UI (the request itself still completes server-side).
      .with({ type: 'close' }, (): RefineModalState => ({ status: 'closed' }))
      .with({ type: 'succeeded' }, (): RefineModalState => ({ status: 'closed' }))
      // Typing is allowed while open or after an error (which clears the error);
      // ignored mid-submit and during grilling (there's no textarea then).
      .with(
        { type: 'setText' },
        ({ text }): RefineModalState =>
          match(state)
            .with(
              { status: 'open' },
              { status: 'error' },
              () => ({ status: 'open', text }) as const,
            )
            .otherwise(() => state),
      )
      // First submit: round 1, no prior answers. The presenter also guards.
      .with(
        { type: 'submit' },
        (): RefineModalState =>
          state.status === 'open' && state.text.trim() !== ''
            ? { status: 'submitting', text: state.text, priorAnswers: [], round: 1 }
            : state,
      )
      .with(
        { type: 'gotQuestions' },
        ({ questions, round }): RefineModalState =>
          state.status === 'submitting'
            ? {
                status: 'grilling',
                text: state.text,
                priorAnswers: state.priorAnswers,
                round,
                questions,
                answers: [],
              }
            : state,
      )
      .with(
        { type: 'setAnswers' },
        ({ answers }): RefineModalState =>
          state.status === 'grilling' ? { ...state, answers } : state,
      )
      // Re-submit with this round's answers folded in; bump the round.
      .with(
        { type: 'submitAnswers' },
        ({ priorAnswers }): RefineModalState =>
          state.status === 'grilling'
            ? { status: 'submitting', text: state.text, priorAnswers, round: state.round + 1 }
            : state,
      )
      .with(
        { type: 'failed' },
        ({ message }): RefineModalState =>
          state.status === 'submitting' ? { status: 'error', text: state.text, message } : state,
      )
      .exhaustive()
  )
}

export type RefineModalDisplay =
  | { readonly open: false }
  | {
      readonly open: true
      readonly view: 'input'
      readonly text: string
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

export function deriveRefineModal(state: RefineModalState): RefineModalDisplay {
  return match(state)
    .with({ status: 'closed' }, () => ({ open: false }) as const)
    .with({ status: 'open' }, ({ text }) => ({
      open: true as const,
      view: 'input' as const,
      text,
      submitting: false,
      canSubmit: text.trim() !== '',
      error: null,
    }))
    .with({ status: 'submitting' }, ({ text }) => ({
      open: true as const,
      view: 'input' as const,
      text,
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
    .with({ status: 'error' }, ({ text, message }) => ({
      open: true as const,
      view: 'input' as const,
      text,
      submitting: false,
      canSubmit: text.trim() !== '',
      error: message,
    }))
    .exhaustive()
}
