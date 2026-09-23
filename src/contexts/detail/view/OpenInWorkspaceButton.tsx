import { Loader2, TerminalSquare } from 'lucide-react'
import { useWorkspaceActions } from '../presenter'
import { WorkspaceActionModals } from './WorkspaceActionModals'

export function OpenInWorkspaceButton({
  issueKey,
  typeName,
  title,
}: {
  issueKey: string
  typeName: string
  title: string
}) {
  const workspace = useWorkspaceActions()
  return (
    <>
      <button
        type="button"
        onClick={() => workspace.startOpen({ issueKey, typeName, title })}
        disabled={workspace.busy}
        aria-label="Open in Workspace"
        className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
      >
        {workspace.busy ? (
          <Loader2 size={12} className="animate-spin" />
        ) : (
          <TerminalSquare size={12} />
        )}
        <span>Open in Workspace</span>
      </button>
      <WorkspaceActionModals api={workspace} />
    </>
  )
}
