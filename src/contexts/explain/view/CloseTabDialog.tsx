import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/design-system'
import { testIds } from '~/lib/testids'
import type { ExplainCloseDisplay } from '../view-model'

/**
 * The confirmation before a close that throws work away (ADR-0009 §9): closing
 * deletes the report, aborts any run in flight, and removes the worktree, and
 * getting any of it back costs another multi-minute agent run. Same reasoning
 * that puts Discard Workspace behind a confirmation.
 *
 * A tab with nothing behind it — failed, or interrupted with no report — is
 * closed by the presenter without reaching this dialog.
 */
export function CloseTabDialog({
  closing,
  onDismiss,
  onConfirm,
}: {
  closing: ExplainCloseDisplay | null
  onDismiss: () => void
  onConfirm: (iid: number) => void
}) {
  return (
    <Dialog open={closing !== null} onOpenChange={(open) => !open && onDismiss()}>
      {closing !== null && (
        <DialogContent data-testid={testIds.explainCloseDialog} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Close this review?</DialogTitle>
            <DialogDescription>{`!${closing.iid} — ${closing.title}`}</DialogDescription>
          </DialogHeader>
          <p className="text-ink-subtle px-1 text-xs leading-relaxed">
            Closing deletes the report, stops the agent if it is still working, and removes the
            worktree. Getting it back means another review run, which takes minutes.
          </p>
          <DialogFooter>
            <button
              type="button"
              onClick={onDismiss}
              className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-8 items-center rounded-md border px-3 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              Keep it open
            </button>
            <button
              type="button"
              onClick={() => onConfirm(closing.iid)}
              data-testid={testIds.explainCloseConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-ring inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              Close review
            </button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
