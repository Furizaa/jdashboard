import { useEffect, useReducer, useRef, type RefObject } from 'react'
import { useTransitionAction, useTransitions } from '~/coordinator'
import {
  derive,
  initialState,
  reduce,
  type DisplayState,
} from '../view-model/status-pill-select-view-model'

export type StatusPillSelectApi = {
  display: DisplayState
  triggerRef: RefObject<HTMLDivElement | null>
  toggle: () => void
  close: () => void
  selectTransition: (transitionId: string, toStatusName: string) => void
}

export function useStatusPillSelect(issueKey: string, currentStatus: string): StatusPillSelectApi {
  const [state, dispatch] = useReducer(reduce, initialState)
  const triggerRef = useRef<HTMLDivElement>(null)
  const transitions = useTransitions(issueKey, state.open)
  const mutation = useTransitionAction()

  useEffect(() => {
    if (!state.open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!triggerRef.current) return
      if (!triggerRef.current.contains(event.target as Node)) dispatch({ type: 'close' })
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        dispatch({ type: 'close' })
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [state.open])

  const display = derive(state, currentStatus, {
    data: transitions.data,
    isPending: transitions.isPending,
    isError: transitions.isError,
  })

  return {
    display,
    triggerRef,
    toggle: () => dispatch({ type: 'toggle' }),
    close: () => dispatch({ type: 'close' }),
    selectTransition: (transitionId, toStatusName) => {
      dispatch({ type: 'close' })
      mutation.mutate({ key: issueKey, transitionId, toStatusName })
    },
  }
}
