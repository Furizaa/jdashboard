import { EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { StatusPillSelect } from '~/widgets/status-pill'
import { TypeIcon, colorForLabel } from '~/widgets/ticket-card'
import { Mr, rootStateFromPhase } from '~/widgets/mr-section'
import {
  useBoardData,
  useMrFor,
  useRemoveFromWatchlist,
  useWatchlistMembership,
  useWorkspaceOpen,
} from '~/coordinator'
import { columnForStatus, type DetailIssue } from '~/kernel'
import { testIds } from '~/lib/testids'
import { Field } from './Field'
import { TagControls } from './TagControls'
import { OpenInWorkspaceButton } from './OpenInWorkspaceButton'
import { WorkspaceControls } from './WorkspaceControls'
import { ExplainMrButton } from './ExplainMrButton'

export function PropertiesRail({ issue }: { issue: DetailIssue }) {
  return (
    <aside className="flex flex-col gap-5 text-xs">
      <Field label="Actions">
        <div className="flex flex-col gap-1.5">
          <WorkspaceAction issueKey={issue.key} typeName={issue.typeName} title={issue.summary} />
          <ExplainMrButton issueKey={issue.key} />
          <WatchlistAction issueKey={issue.key} />
        </div>
      </Field>
      <Field label="Status">
        <StatusPillSelect issueKey={issue.key} status={issue.statusName} />
      </Field>
      <Field label="Type">
        <span className="inline-flex items-center gap-1.5">
          <TypeIcon type={issue.typeName} />
          <span className="text-foreground">{issue.typeName}</span>
        </span>
      </Field>
      <Field label="Priority">
        <span className="text-foreground">{issue.priorityName ?? '—'}</span>
      </Field>
      <Field label="Assignee">
        <span className="text-foreground">{issue.assigneeName ?? 'Unassigned'}</span>
      </Field>
      <Field label="Reporter">
        <span className="text-foreground">{issue.reporterName ?? '—'}</span>
      </Field>
      <Field label="Labels">
        {issue.labels.length === 0 ? (
          <span className="text-ink-tertiary">—</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            {issue.labels.map((label) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorForLabel(label) }}
                />
                <span className="text-foreground">{label}</span>
              </span>
            ))}
          </div>
        )}
      </Field>
      <Field label="Tags">
        <TagControls issueKey={issue.key} />
      </Field>
      <PanelMrBlock issueKey={issue.key} />
    </aside>
  )
}

// When a cmux workspace is already open for this ticket, its open/create
// affordance is replaced by focus + discard controls.
function WorkspaceAction({
  issueKey,
  typeName,
  title,
}: {
  issueKey: string
  typeName: string
  title: string
}) {
  const workspaceOpen = useWorkspaceOpen(issueKey)
  return workspaceOpen ? (
    <WorkspaceControls issueKey={issueKey} />
  ) : (
    <OpenInWorkspaceButton issueKey={issueKey} typeName={typeName} title={title} />
  )
}

// Shown only for tickets already on the watchlist; adding happens from the
// header modal. Removal takes the card out of the In Implementation sub-section.
function WatchlistAction({ issueKey }: { issueKey: string }) {
  const isMember = useWatchlistMembership(issueKey)
  const { remove, isPending } = useRemoveFromWatchlist()
  if (!isMember) return null
  const handleRemove = async () => {
    try {
      const result = await remove(issueKey)
      if (!result.ok) toast.error(`Remove from watchlist failed: ${result.error.message}`)
    } catch (error) {
      toast.error(
        `Remove from watchlist failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={isPending}
      aria-label="Remove from Watchlist"
      data-testid={testIds.watchlistRemove}
      className="border-border bg-surface-1 text-destructive hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isPending ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
      <span>Remove from Watchlist</span>
    </button>
  )
}

function PanelMrBlock({ issueKey }: { issueKey: string }) {
  const result = useMrFor(issueKey)
  const board = useBoardData()
  const issue = board.data?.ok ? board.data.issues.find((i) => i.key === issueKey) : null
  const column = issue ? columnForStatus(issue.statusName) : null
  const state = rootStateFromPhase(result.state)
  const summary = result.state === 'ready' ? result.summary : null

  return (
    <Mr.Root state={state} summary={summary} layout="stack" issueKey={issueKey} column={column}>
      <Mr.ReviewerStack />
      <Mr.PriorityBadge />
      <Mr.WarningRow />
      <Mr.OpenLink />
    </Mr.Root>
  )
}
