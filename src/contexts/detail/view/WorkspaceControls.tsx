import { Focus, Loader2, Trash2 } from 'lucide-react'
import { useWorkspaceActions } from '../presenter'
import { WorkspaceActionModals } from './WorkspaceActionModals'

export function WorkspaceControls({ issueKey }: { issueKey: string }) {
  const workspace = useWorkspaceActions()
  return (
    <>
      <button
        type="button"
        onClick={() => workspace.focus(issueKey)}
        disabled={workspace.busy}
        aria-label="Focus Workspace"
        className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {workspace.focusing ? <Loader2 size={12} className="animate-spin" /> : <Focus size={12} />}
        <span>Focus Workspace</span>
      </button>
      <button
        type="button"
        onClick={() => workspace.requestDiscard(issueKey)}
        disabled={workspace.busy}
        aria-label="Discard Workspace"
        className="border-border bg-surface-1 text-destructive hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Trash2 size={12} />
        <span>Discard Workspace</span>
      </button>
      <WorkspaceActionModals api={workspace} />
    </>
  )
}
