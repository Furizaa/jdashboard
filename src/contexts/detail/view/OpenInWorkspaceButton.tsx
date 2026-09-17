import { Loader2, TerminalSquare } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useInvalidateWorkspaces, useMrFor, useReviewCards } from '~/coordinator'
import type { GetReviewCardsResult } from '~/kernel'
import { checkWorktree, getMrSourceBranch, openInWorkspace } from '~/server/server-functions/detail'
import { branchSlug, defaultWorkspaceName } from '../domain'
import { WorkspaceModal, type WorkspaceModalConfirm } from './WorkspaceModal'

type Prompt = {
  branchName: string
  workspaceName: string
  existing: boolean
  worktreeExists: boolean
}

type FlowState =
  | { phase: 'idle' }
  | { phase: 'checking' }
  | ({ phase: 'prompting' } & Prompt)
  | ({ phase: 'creating' } & Prompt)

function findReviewMrIid(data: GetReviewCardsResult | undefined, issueKey: string): number | null {
  if (data === undefined || data.ok !== true) return null
  for (const card of data.cards) {
    if (card.kind === 'review-real' && card.jira.key === issueKey) return card.iid
  }
  return null
}

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
  const invalidateWorkspaces = useInvalidateWorkspaces()

  // Resolve the work item's MR the same way the Open MR / Review MR buttons do:
  // an MR we authored, or one we're a reviewer on. The iid is the only reliable
  // handle on the MR's branch — branch names don't always embed the issue key.
  const authorResult = useMrFor(issueKey)
  const reviewQuery = useReviewCards()
  const authorIid =
    authorResult.state === 'ready' && authorResult.summary !== null
      ? authorResult.summary.iid
      : null
  const mrIid = authorIid ?? findReviewMrIid(reviewQuery.data, issueKey)

  const busy = state.phase !== 'idle' && state.phase !== 'prompting'
  const prompt = state.phase === 'prompting' || state.phase === 'creating' ? state : null

  const handleClick = async () => {
    setState({ phase: 'checking' })
    const workspaceName = defaultWorkspaceName({ issueKey, title })
    try {
      const check = await checkWorktree({ data: { issueKey } })
      if (check.worktreeExists) {
        setState({
          phase: 'prompting',
          branchName: '',
          workspaceName,
          existing: false,
          worktreeExists: true,
        })
        return
      }
      const existingBranch =
        mrIid !== null ? (await getMrSourceBranch({ data: { iid: mrIid } })).sourceBranch : null
      if (existingBranch !== null && existingBranch !== '') {
        setState({
          phase: 'prompting',
          branchName: existingBranch,
          workspaceName,
          existing: true,
          worktreeExists: false,
        })
      } else {
        setState({
          phase: 'prompting',
          branchName: branchSlug({ issueKey, typeName, title }),
          workspaceName,
          existing: false,
          worktreeExists: false,
        })
      }
    } catch (error) {
      toast.error(
        `Open in Workspace failed: ${error instanceof Error ? error.message : String(error)}`,
      )
      setState((prev) => (prev.phase === 'prompting' ? prev : { phase: 'idle' }))
    }
  }

  const handleConfirm = async ({ branchName, workspaceName, color }: WorkspaceModalConfirm) => {
    if (state.phase !== 'prompting') return
    setState({ ...state, phase: 'creating' })
    try {
      const result = await openInWorkspace({
        data: {
          issueKey,
          branchName,
          fromExistingBranch: state.existing,
          workspaceName,
          color,
        },
      })
      if (!result.ok) toast.error(`Open in Workspace failed: ${result.error.message}`)
      else invalidateWorkspaces()
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
      <WorkspaceModal
        open={prompt !== null}
        issueKey={issueKey}
        worktreeExists={prompt?.worktreeExists ?? false}
        lockedBranch={prompt?.existing ?? false}
        initialBranchName={prompt?.branchName ?? ''}
        initialWorkspaceName={prompt?.workspaceName ?? ''}
        isPending={state.phase === 'creating'}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </>
  )
}
