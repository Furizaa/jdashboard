import { useState } from 'react'
import { Focus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { useInvalidateWorkspaces } from '~/coordinator'
import { discardWorkspace, focusWorkspace } from '~/server/server-functions/detail'

type Busy = 'idle' | 'focusing' | 'discarding'

export function WorkspaceControls({ issueKey }: { issueKey: string }) {
  const [busy, setBusy] = useState<Busy>('idle')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const invalidateWorkspaces = useInvalidateWorkspaces()

  const handleFocus = async () => {
    setBusy('focusing')
    try {
      const result = await focusWorkspace({ data: { issueKey } })
      if (!result.ok) {
        toast.error(`Focus workspace failed: ${result.error.message}`)
        invalidateWorkspaces()
      }
    } catch (error) {
      toast.error(
        `Focus workspace failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setBusy('idle')
    }
  }

  const handleDiscard = async () => {
    setBusy('discarding')
    try {
      const result = await discardWorkspace({ data: { issueKey } })
      if (result.ok) {
        setConfirmOpen(false)
      } else {
        toast.error(`Discard workspace failed: ${result.error.message}`)
      }
    } catch (error) {
      toast.error(
        `Discard workspace failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      invalidateWorkspaces()
      setBusy('idle')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleFocus}
        disabled={busy !== 'idle'}
        aria-label="Focus Workspace"
        className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy === 'focusing' ? <Loader2 size={12} className="animate-spin" /> : <Focus size={12} />}
        <span>Focus Workspace</span>
      </button>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={busy !== 'idle'}
        aria-label="Discard Workspace"
        className="border-border bg-surface-1 text-destructive hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={12} />
        <span>Discard Workspace</span>
      </button>
      <DiscardWorkspaceModal
        open={confirmOpen}
        issueKey={issueKey}
        isPending={busy === 'discarding'}
        onConfirm={handleDiscard}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}

function DiscardWorkspaceModal({
  open,
  issueKey,
  isPending,
  onConfirm,
  onCancel,
}: {
  open: boolean
  issueKey: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !isPending && onCancel()}>
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
