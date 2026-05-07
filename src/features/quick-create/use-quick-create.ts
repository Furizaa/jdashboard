import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { useCreateAction } from '~/dashboard'
import type { CreateIssueResultWithTimeout } from '~/dashboard/service'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'

export type QuickCreateDeps = {
  submit: (input: QuickCreateInput) => Promise<CreateIssueResultWithTimeout>
  isPending: boolean
}

export type QuickCreateState = {
  open: boolean
  isPending: boolean
  /** Pass to <Dialog.Root onOpenChange>. Blocks close while pending. */
  setOpen: (next: boolean) => void
  /** Pass to the trigger button. */
  openModal: () => void
  /** Pass to in-modal Cancel / X. */
  closeModal: () => void
  /** Bind to <form onSubmit> via TanStack Form's handleSubmit. Returns the result. */
  submit: (input: QuickCreateInput) => Promise<CreateIssueResultWithTimeout>
  /** Form calls this once during mount with `() => form.reset()`. */
  registerReset: (reset: () => void) => void
}

type StateHandles = {
  open: boolean
  setOpen: (next: boolean) => void
  resetRef: RefObject<(() => void) | null>
}

export function useQuickCreate(): QuickCreateState {
  const [open, setOpenState] = useState(false)
  const resetRef = useRef<(() => void) | null>(null)
  const action = useCreateAction({
    closeModal: () => setOpenState(false),
    resetForm: () => resetRef.current?.(),
  })
  return useQuickCreateWithDeps(
    { submit: action.mutateAsync, isPending: action.isPending },
    { open, setOpen: setOpenState, resetRef },
  )
}

export function useQuickCreateWithDeps(
  deps: QuickCreateDeps,
  state: StateHandles,
): QuickCreateState {
  const { open, setOpen, resetRef } = state
  const { submit, isPending } = deps

  // 'c' global shortcut to open. Modifier-guarded, input-typing-guarded,
  // suppressed while already open.
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'c') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
      if (openRef.current) return
      const target = e.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setOpen(true)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  const setOpenGuarded = useCallback(
    (next: boolean) => {
      if (isPending && !next) return
      setOpen(next)
    },
    [isPending, setOpen],
  )
  const openModal = useCallback(() => setOpenGuarded(true), [setOpenGuarded])
  const closeModal = useCallback(() => setOpenGuarded(false), [setOpenGuarded])
  const registerReset = useCallback(
    (reset: () => void) => {
      resetRef.current = reset
    },
    [resetRef],
  )

  return {
    open,
    isPending,
    setOpen: setOpenGuarded,
    openModal,
    closeModal,
    submit,
    registerReset,
  }
}
