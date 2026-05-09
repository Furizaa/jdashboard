import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Result } from 'neverthrow'
import { match, P } from 'ts-pattern'
import { useCreateAction, type CreateIssueError, type CreateIssueSnapshot } from '~/coordinator'
import type { QuickCreateInput } from '~/kernel'
import {
  initialState,
  isOpen as selectIsOpen,
  isPending as selectIsPending,
  reduce,
  type State,
} from '../view-model'

export type SubmitFn = (
  input: QuickCreateInput,
) => Promise<Result<CreateIssueSnapshot, CreateIssueError>>

export type QuickCreateApi = {
  /** True for `open-idle | open-pending | open-error`. Bind to Dialog.Root open prop. */
  open: boolean
  /** True only while a submit is in flight. */
  isPending: boolean
  /** Bind to <Dialog.Root onOpenChange>. Closing while pending is rejected by the state machine. */
  setOpen: (next: boolean) => void
  /** Bind to the trigger button. */
  openModal: () => void
  /** Bind to in-modal Cancel / X. */
  closeModal: () => void
  /** Bind to <form onSubmit> via TanStack Form's handleSubmit. Returns the result. */
  submit: SubmitFn
  /** Form calls this once during mount with `() => form.reset()`. */
  registerReset: (reset: () => void) => void
}

export type QuickCreateDeps = {
  submit: SubmitFn
}

export function useQuickCreate(): QuickCreateApi {
  const action = useCreateAction()
  return useQuickCreateWithDeps({ submit: action.mutateAsync })
}

export function useQuickCreateWithDeps(deps: QuickCreateDeps): QuickCreateApi {
  const [state, dispatch] = useReducer(reduce, initialState)
  const resetRef = useRef<(() => void) | null>(null)

  const phaseRef = useRef<State['phase']>(state.phase)
  phaseRef.current = state.phase

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'c') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (phaseRef.current !== 'closed') return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      dispatch({ type: 'opened' })
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  const openModal = useCallback(() => dispatch({ type: 'opened' }), [])
  const closeModal = useCallback(() => dispatch({ type: 'closed' }), [])
  const setOpen = useCallback((next: boolean) => dispatch({ type: next ? 'opened' : 'closed' }), [])

  const submitDep = deps.submit
  const submit: SubmitFn = useCallback(
    async (input) => {
      dispatch({ type: 'formSubmitted' })
      const result = await submitDep(input)
      result.match(
        () => {
          dispatch({ type: 'submitResolved' })
          resetRef.current?.()
        },
        (error) => {
          match(error)
            .with({ _tag: 'CreateIssueTimeout' }, () => {
              dispatch({ type: 'timedOut' })
            })
            .with(
              { _tag: P.union('CreateIssueRejected', 'CreateIssueUnauthorized') },
              ({ message }) => {
                dispatch({ type: 'submitRejected', message })
              },
            )
            .with({ _tag: 'CreateIssueNetworkError' }, ({ message }) => {
              dispatch({ type: 'submitRejected', message })
            })
            .exhaustive()
        },
      )
      return result
    },
    [submitDep],
  )

  const registerReset = useCallback((reset: () => void) => {
    resetRef.current = reset
  }, [])

  return {
    open: selectIsOpen(state),
    isPending: selectIsPending(state),
    setOpen,
    openModal,
    closeModal,
    submit,
    registerReset,
  }
}
