import { useCallback, useReducer } from 'react'
import { toast } from 'sonner'
import { resolveRefineAnswers, type AskTicketResult, type RefineAnswer } from '~/kernel'
import { useAskTicket } from '~/coordinator'
import {
  deriveAskModal,
  initialAskModalState,
  reduceAskModal,
  type AskModalDisplay,
} from '../view-model'

export type AskModalApi = {
  display: AskModalDisplay
  open: () => void
  close: () => void
  setQuestion: (question: string) => void
  submit: () => void
  setAnswers: (answers: readonly RefineAnswer[]) => void
  submitAnswers: () => void
  askAgain: () => void
}

// Thin React shell over `ask-modal-view-model`. Like `use-refine-modal`, it owns the
// one effectful job the pure view-model can't: firing the ask mutation and turning its
// resolution into a dispatch. An ask can resolve three ways — an answer (show it),
// clarifying questions (enter the grilling step), or a failure (toast + error). When
// the user answers a grilling round, we resolve those answers to human-readable pairs
// (unanswered → the agent's recommended, i.e. skip) and re-run with them folded in.
export function useAskModal(issueKey: string): AskModalApi {
  const [state, dispatch] = useReducer(reduceAskModal, initialAskModalState)
  const { ask } = useAskTicket()

  const handle = useCallback((result: AskTicketResult) => {
    if (!result.ok) {
      dispatch({ type: 'failed', message: result.error.message })
      toast.error(`Couldn't answer: ${result.error.message}`)
      return
    }
    if (result.kind === 'questions') {
      dispatch({ type: 'gotQuestions', questions: result.questions, round: result.round })
      return
    }
    dispatch({ type: 'answered', answer: result.answer })
  }, [])

  const onError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dispatch({ type: 'failed', message })
    toast.error(`Couldn't answer: ${message}`)
  }, [])

  const submit = useCallback(() => {
    if (state.status !== 'open' || state.question.trim() === '') return
    const question = state.question
    dispatch({ type: 'submit' })
    ask(issueKey, question, [], 1).then(handle, onError)
  }, [state, ask, issueKey, handle, onError])

  const submitAnswers = useCallback(() => {
    if (state.status !== 'grilling') return
    const priorAnswers = [
      ...state.priorAnswers,
      ...resolveRefineAnswers(state.questions, state.answers),
    ]
    dispatch({ type: 'submitAnswers', priorAnswers })
    ask(issueKey, state.question, priorAnswers, state.round + 1).then(handle, onError)
  }, [state, ask, issueKey, handle, onError])

  return {
    display: deriveAskModal(state),
    open: () => dispatch({ type: 'open' }),
    close: () => dispatch({ type: 'close' }),
    setQuestion: (question) => dispatch({ type: 'setQuestion', question }),
    submit,
    setAnswers: (answers) => dispatch({ type: 'setAnswers', answers }),
    submitAnswers,
    askAgain: () => dispatch({ type: 'askAgain' }),
  }
}
