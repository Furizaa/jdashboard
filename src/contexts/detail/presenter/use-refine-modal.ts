import { useCallback, useReducer } from 'react'
import { toast } from 'sonner'
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
  close: () => void
  setText: (text: string) => void
  submit: () => void
}

// Thin React shell over `refine-modal-view-model`. It owns the one effectful job
// the pure view-model can't: firing the refine mutation on submit and turning its
// resolution into a `succeeded`/`failed` dispatch (plus a failure toast). A
// successful refine closes the modal and hands the rewritten note to `onRefined`
// so the panel adopts it at once; the changelog refetches via the mutation's
// cache invalidation in `useRefineNote`.
export function useRefineModal(
  issueKey: string,
  onRefined?: (note: string) => void,
): RefineModalApi {
  const [state, dispatch] = useReducer(reduceRefineModal, initialRefineModalState)
  const { refine } = useRefineNote()

  const submit = useCallback(() => {
    if (state.status !== 'open' || state.text.trim() === '') return
    const text = state.text
    dispatch({ type: 'submit' })
    refine(issueKey, text).then(
      (result) => {
        if (result.ok) {
          dispatch({ type: 'succeeded' })
          onRefined?.(result.note)
        } else {
          dispatch({ type: 'failed', message: result.error.message })
          toast.error(`Couldn't refine note: ${result.error.message}`)
        }
      },
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        dispatch({ type: 'failed', message })
        toast.error(`Couldn't refine note: ${message}`)
      },
    )
  }, [state, refine, issueKey, onRefined])

  return {
    display: deriveRefineModal(state),
    open: () => dispatch({ type: 'open' }),
    close: () => dispatch({ type: 'close' }),
    setText: (text) => dispatch({ type: 'setText', text }),
    submit,
  }
}
