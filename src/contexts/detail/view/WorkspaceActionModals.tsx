import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import type { WorkspaceActionsApi } from '../presenter'
import { WorkspaceModal } from './WorkspaceModal'

// Both dialogs the workspace flows need, rendered from one `useWorkspaceActions`
// api. Mounted by the panel's workspace buttons and, separately, by the command
// palette's host — so a palette-triggered open still gets the branch prompt and
// a palette-triggered discard still gets its confirmation.
export function WorkspaceActionModals({ api }: { api: WorkspaceActionsApi }) {
  return (
    <>
      <WorkspaceModal
        open={api.prompt !== null}
        issueKey={api.prompt?.issueKey ?? ''}
        worktreeExists={api.prompt?.worktreeExists ?? false}
        lockedBranch={api.prompt?.existing ?? false}
        initialBranchName={api.prompt?.branchName ?? ''}
        initialWorkspaceName={api.prompt?.workspaceName ?? ''}
        isPending={api.promptPending}
        onConfirm={api.confirmOpen}
        onCancel={api.cancelOpen}
      />
      <DiscardWorkspaceModal
        issueKey={api.confirmDiscardFor}
        isPending={api.discarding}
        onConfirm={api.confirmDiscard}
        onCancel={api.cancelDiscard}
      />
    </>
  )
}

function DiscardWorkspaceModal({
  issueKey,
  isPending,
  onConfirm,
  onCancel,
}: {
  issueKey: string | null
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={issueKey !== null} onOpenChange={(next) => !next && !isPending && onCancel()}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault()
        }}
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault()
        }}
        className="w-[min(28rem,calc(100vw-2rem))] gap-0 p-6 sm:max-w-[28rem]"
      >
        <DialogTitle className="text-foreground mb-1 text-[15px] font-semibold tracking-[-0.015em]">
          Discard workspace for {issueKey}?
        </DialogTitle>
        <p className="text-ink-subtle mb-4 text-xs">
          This closes the cmux workspace and force-removes its git worktree in the background,
          discarding any uncommitted changes. The local branch is kept, so committed work survives.
        </p>
        <div className="mt-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring rounded-md border px-3.5 py-2 text-[13px] font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive text-destructive-foreground focus-visible:ring-ring inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-[13px] font-medium transition-colors hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
          >
            {isPending && <Loader2 size={14} className="animate-spin" />}
            <span>Discard Workspace</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
