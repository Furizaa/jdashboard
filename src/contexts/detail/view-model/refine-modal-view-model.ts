import { match } from 'ts-pattern'

// Framework-free state machine for the Refine modal: the user pastes text (a
// transcript or an instruction), submits, and a headless agent rewrites the note.
// The reducer owns the modal's lifecycle; the presenter (`use-refine-modal.ts`)
// wires the refine mutation and turns `succeeded`/`failed` into dispatches. No
// React, no I/O here.

export type RefineModalState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly text: string }
  | { readonly status: 'submitting'; readonly text: string }
  | { readonly status: 'error'; readonly text: string; readonly message: string }

export const initialRefineModalState: RefineModalState = { status: 'closed' }

export type RefineModalEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'setText'; text: string }
  | { type: 'submit' }
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
      // ignored mid-submit (the textarea is disabled) and when closed.
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
      // Submit only fires from open with non-blank text; the presenter also guards.
      .with(
        { type: 'submit' },
        (): RefineModalState =>
          state.status === 'open' && state.text.trim() !== ''
            ? { status: 'submitting', text: state.text }
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
      readonly text: string
      readonly submitting: boolean
      readonly canSubmit: boolean
      readonly error: string | null
    }

export function deriveRefineModal(state: RefineModalState): RefineModalDisplay {
  return match(state)
    .with({ status: 'closed' }, () => ({ open: false }) as const)
    .with({ status: 'open' }, ({ text }) => ({
      open: true as const,
      text,
      submitting: false,
      canSubmit: text.trim() !== '',
      error: null,
    }))
    .with({ status: 'submitting' }, ({ text }) => ({
      open: true as const,
      text,
      submitting: true,
      canSubmit: false,
      error: null,
    }))
    .with({ status: 'error' }, ({ text, message }) => ({
      open: true as const,
      text,
      submitting: false,
      canSubmit: text.trim() !== '',
      error: message,
    }))
    .exhaustive()
}
