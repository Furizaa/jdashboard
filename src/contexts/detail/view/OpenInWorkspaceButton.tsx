import { Loader2, TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { checkWorktree, openInWorkspace } from '~/server/server-functions/detail'
import { branchSlug } from '../domain'
import { BranchNameModal } from './BranchNameModal'

type FlowState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | { phase: 'prompting'; branchName: string }
  | { phase: 'creating'; branchName: string }
  | { phase: 'opening' }

export function OpenInWorkspaceButton({
  issueKey,
  typeName,
  title,
}: {
  issueKey: string
  typeName: string
  title: string
}) {
  const [state, setState] = useState<FlowState>({ phase: 'idle' })

  const busy = state.phase !== 'idle' && state.phase !== 'prompting'

  const runOpen = async (branchName?: string) => {
    const result = await openInWorkspace({ data: { issueKey, branchName } })
    if (!result.ok) {
      toast.error(`Open in Workspace failed: ${result.error.message}`)
    }
  }

  const handleClick = async () => {
    setState({ phase: 'checking' })
    try {
      const check = await checkWorktree({ data: { issueKey } })
      if (check.worktreeExists) {
        setState({ phase: 'opening' })
        await runOpen()
      } else {
        setState({
          phase: 'prompting',
          branchName: branchSlug({ issueKey, typeName, title }),
        })
      }
    } catch (error) {
      toast.error(
        `Open in Workspace failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setState((prev) => (prev.phase === 'prompting' ? prev : { phase: 'idle' }))
    }
  }

  const handleConfirm = async (branchName: string) => {
    setState({ phase: 'creating', branchName })
    try {
      await runOpen(branchName)
    } catch (error) {
      toast.error(
        `Open in Workspace failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setState({ phase: 'idle' })
    }
  }

  const handleCancel = () => setState({ phase: 'idle' })

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-label="Open in Workspace"
        className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <TerminalSquare size={12} />}
        <span>Open in Workspace</span>
      </button>
      <BranchNameModal
        open={state.phase === 'prompting' || state.phase === 'creating'}
        initialBranchName={
          state.phase === 'prompting' || state.phase === 'creating' ? state.branchName : ''
        }
        issueKey={issueKey}
        isPending={state.phase === 'creating'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  )
}
