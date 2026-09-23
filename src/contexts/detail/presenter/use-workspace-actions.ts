import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useInvalidateWorkspaces, useMrStatuses, useReviewCards } from '~/coordinator'
import { resolveMrForKey } from '~/kernel'
import {
  checkWorktree,
  discardWorkspace,
  focusWorkspace,
  getMrSourceBranch,
  openInWorkspace,
} from '~/server/server-functions/detail'
import { branchSlug, defaultWorkspaceName } from '../domain'
import type { WorkspaceModalConfirm } from '../view/WorkspaceModal'

// The three workspace flows — open (with its branch-name prompt), focus, and
// discard (with its confirmation) — lifted out of `OpenInWorkspaceButton` and
// `WorkspaceControls` so they can be driven by a ticket the caller *names*
// rather than one it renders.
//
// The command palette needs exactly that. Per ADR-0008 it cannot import this
// context, so `routes/-command-palette/` mounts this hook alongside the panel's
// and hands the palette plain `run` closures. Reusing the flow rather than
// reimplementing it is a deliberate choice: the prompt carries the
// worktree-already-exists warning, the existing-MR-branch reuse, and the
// workspace name/colour — skipping it would create a branch the user never saw.

export type WorkspaceTarget = {
  readonly issueKey: string
  readonly typeName: string
  readonly title: string
}

type Prompt = {
  readonly issueKey: string
  readonly branchName: string
  readonly workspaceName: string
  readonly existing: boolean
  readonly worktreeExists: boolean
}

type OpenPhase =
  | { readonly phase: 'idle' }
  | { readonly phase: 'checking' }
  | ({ readonly phase: 'prompting' } & Prompt)
  | ({ readonly phase: 'creating' } & Prompt)

type Busy = 'idle' | 'focusing' | 'discarding'

export type WorkspaceActionsApi = {
  /** Any flow in flight — the panel buttons disable on this. */
  readonly busy: boolean
  readonly prompt: Prompt | null
  readonly promptPending: boolean
  readonly focusing: boolean
  readonly discarding: boolean
  /** The ticket whose discard is awaiting confirmation, or `null`. */
  readonly confirmDiscardFor: string | null
  readonly startOpen: (target: WorkspaceTarget) => void
  readonly confirmOpen: (confirm: WorkspaceModalConfirm) => void
  readonly cancelOpen: () => void
  readonly focus: (issueKey: string) => void
  readonly requestDiscard: (issueKey: string) => void
  readonly confirmDiscard: () => void
  readonly cancelDiscard: () => void
}

function reportFailure(verb: string, error: unknown): void {
  toast.error(`${verb} failed: ${error instanceof Error ? error.message : String(error)}`)
}

export function useWorkspaceActions(): WorkspaceActionsApi {
  const [open, setOpen] = useState<OpenPhase>({ phase: 'idle' })
  const [busy, setBusy] = useState<Busy>('idle')
  const [confirmDiscardFor, setConfirmDiscardFor] = useState<string | null>(null)
  const invalidateWorkspaces = useInvalidateWorkspaces()

  // Read both MR sources here and resolve at start time, since the target ticket
  // is only known when the flow begins — the panel's `useMrRef(key)` cannot be
  // used from a hook that is not keyed to one ticket.
  const mrStatuses = useMrStatuses()
  const reviewQuery = useReviewCards()
  const authoredByKey = mrStatuses.data?.ok === true ? mrStatuses.data.byKey : undefined
  const reviewCards = reviewQuery.data?.ok === true ? reviewQuery.data.cards : undefined

  const startOpen = useCallback(
    (target: WorkspaceTarget) => {
      const { issueKey, typeName, title } = target
      const workspaceName = defaultWorkspaceName({ issueKey, title })
      const mrIid = resolveMrForKey({ issueKey, authoredByKey, reviewCards })?.iid ?? null
      setOpen({ phase: 'checking' })
      void (async () => {
        try {
          const check = await checkWorktree({ data: { issueKey } })
          if (check.worktreeExists) {
            setOpen({
              phase: 'prompting',
              issueKey,
              branchName: '',
              workspaceName,
              existing: false,
              worktreeExists: true,
            })
            return
          }
          const existingBranch =
            mrIid !== null ? (await getMrSourceBranch({ data: { iid: mrIid } })).sourceBranch : null
          const hasExisting = existingBranch !== null && existingBranch !== ''
          setOpen({
            phase: 'prompting',
            issueKey,
            branchName: hasExisting ? existingBranch : branchSlug({ issueKey, typeName, title }),
            workspaceName,
            existing: hasExisting,
            worktreeExists: false,
          })
        } catch (error) {
          reportFailure('Open in Workspace', error)
          setOpen((prev) => (prev.phase === 'prompting' ? prev : { phase: 'idle' }))
        }
      })()
    },
    [authoredByKey, reviewCards],
  )

  const confirmOpen = useCallback(
    ({ branchName, workspaceName, color }: WorkspaceModalConfirm) => {
      if (open.phase !== 'prompting') return
      const prompting = open
      setOpen({ ...prompting, phase: 'creating' })
      void (async () => {
        try {
          const result = await openInWorkspace({
            data: {
              issueKey: prompting.issueKey,
              branchName,
              fromExistingBranch: prompting.existing,
              workspaceName,
              color,
            },
          })
          if (!result.ok) toast.error(`Open in Workspace failed: ${result.error.message}`)
          else invalidateWorkspaces()
        } catch (error) {
          reportFailure('Open in Workspace', error)
        } finally {
          setOpen({ phase: 'idle' })
        }
      })()
    },
    [open, invalidateWorkspaces],
  )

  const cancelOpen = useCallback(() => setOpen({ phase: 'idle' }), [])

  const focus = useCallback(
    (issueKey: string) => {
      setBusy('focusing')
      void (async () => {
        try {
          const result = await focusWorkspace({ data: { issueKey } })
          if (!result.ok) {
            toast.error(`Focus workspace failed: ${result.error.message}`)
            invalidateWorkspaces()
          }
        } catch (error) {
          reportFailure('Focus workspace', error)
        } finally {
          setBusy('idle')
        }
      })()
    },
    [invalidateWorkspaces],
  )

  // Discard is destructive, so it always goes through the confirmation dialog —
  // including from the palette, where a bare `x` would otherwise force-remove a
  // worktree on one keystroke.
  const requestDiscard = useCallback((issueKey: string) => setConfirmDiscardFor(issueKey), [])
  const cancelDiscard = useCallback(() => setConfirmDiscardFor(null), [])

  const confirmDiscard = useCallback(() => {
    const issueKey = confirmDiscardFor
    if (issueKey === null) return
    setBusy('discarding')
    void (async () => {
      try {
        const result = await discardWorkspace({ data: { issueKey } })
        if (result.ok) setConfirmDiscardFor(null)
        else toast.error(`Discard workspace failed: ${result.error.message}`)
      } catch (error) {
        reportFailure('Discard workspace', error)
      } finally {
        invalidateWorkspaces()
        setBusy('idle')
      }
    })()
  }, [confirmDiscardFor, invalidateWorkspaces])

  const prompt = open.phase === 'prompting' || open.phase === 'creating' ? open : null

  return {
    busy: (open.phase !== 'idle' && open.phase !== 'prompting') || busy !== 'idle',
    prompt,
    promptPending: open.phase === 'creating',
    focusing: busy === 'focusing',
    discarding: busy === 'discarding',
    confirmDiscardFor,
    startOpen,
    confirmOpen,
    cancelOpen,
    focus,
    requestDiscard,
    confirmDiscard,
    cancelDiscard,
  }
}
