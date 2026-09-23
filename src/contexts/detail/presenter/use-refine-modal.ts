import { useCallback, useReducer } from 'react'
import { toast } from 'sonner'
import { resolveRefineAnswers, type RefineAnswer, type RefineNoteResult } from '~/kernel'
import { useRefineNote } from '~/coordinator'
import {
  deriveRefineModal,
  initialRefineModalState,
  reduceRefineModal,
  type RefineModalDisplay,
} from '../view-model'

export type RefineModalApi = {
  display: RefineModalDisplay
  open: () => void
  // Open with the textarea pre-filled — the hand-off from Ask's "Refine to note".
  openWith: (text: string) => void
  close: () => void
  setText: (text: string) => void
  submit: () => void
  setAnswers: (answers: readonly RefineAnswer[]) => void
  submitAnswers: () => void
}

// Thin React shell over `refine-modal-view-model`. It owns the one effectful job
// the pure view-model can't: firing the refine mutation and turning its
// resolution into a dispatch. A refine can resolve three ways — a rewritten note
// (adopt it and close), clarifying questions (enter the grilling step), or a
// failure (toast + error). When the user answers, we resolve those answers to
// human-readable pairs (unanswered → the agent's recommended, i.e. skip) and
// re-run with them folded in.
export function useRefineModal(
  issueKey: string,
  onRefined?: (note: string) => void,
): RefineModalApi {
  const [state, dispatch] = useReducer(reduceRefineModal, initialRefineModalState)
  const { refine } = useRefineNote()

  const handle = useCallback(
    (result: RefineNoteResult) => {
      if (!result.ok) {
        dispatch({ type: 'failed', message: result.error.message })
        toast.error(`Couldn't refine note: ${result.error.message}`)
        return
      }
      if (result.kind === 'questions') {
        dispatch({ type: 'gotQuestions', questions: result.questions, round: result.round })
        return
      }
      dispatch({ type: 'succeeded' })
      onRefined?.(result.note)
    },
    [onRefined],
  )

  const onError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dispatch({ type: 'failed', message })
    toast.error(`Couldn't refine note: ${message}`)
  }, [])

  const submit = useCallback(() => {
    if (state.status !== 'open' || state.text.trim() === '') return
    const text = state.text
    dispatch({ type: 'submit' })
    refine(issueKey, text, [], 1).then(handle, onError)
  }, [state, refine, issueKey, handle, onError])

  const submitAnswers = useCallback(() => {
    if (state.status !== 'grilling') return
    const priorAnswers = [
      ...state.priorAnswers,
      ...resolveRefineAnswers(state.questions, state.answers),
    ]
    dispatch({ type: 'submitAnswers', priorAnswers })
    refine(issueKey, state.text, priorAnswers, state.round + 1).then(handle, onError)
  }, [state, refine, issueKey, handle, onError])

  return {
    display: deriveRefineModal(state),
    open: () => dispatch({ type: 'open' }),
    // Open, then seed the textarea. `setText` applies in the `open` status the first
    // dispatch just produced, so the two dispatches compose without a view-model change.
    openWith: (text: string) => {
      dispatch({ type: 'open' })
      dispatch({ type: 'setText', text })
    },
    close: () => dispatch({ type: 'close' }),
    setText: (text) => dispatch({ type: 'setText', text }),
    submit,
    setAnswers: (answers) => dispatch({ type: 'setAnswers', answers }),
    submitAnswers,
  }
}
