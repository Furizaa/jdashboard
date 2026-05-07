import { MessageSquare } from 'lucide-react'
import { cn } from '~/lib/cn'
import type { Column } from '~/features/board/status-mapping'
import { useMrFor, useMrMergedAction } from '~/dashboard'
import { MrCiIndicator } from './MrCiIndicator'
import { MrWarning } from './MrWarning'
import { ReviewerAvatar } from './ReviewerAvatar'

const MAX_VISIBLE_REVIEWERS = 4
const MERGED_TARGET_STATUS = 'In STG'

function openInNewTab(url: string) {
  return () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function MrSection({ issueKey, column }: { issueKey: string; column: Column }) {
  if (column === 'In Code Review') return <CodeReviewSection issueKey={issueKey} />
  if (column === 'Done') return <DoneSection issueKey={issueKey} />
  return null
}

function DoneSection({ issueKey }: { issueKey: string }) {
  const result = useMrFor(issueKey)
  if (result.state !== 'ready') return null
  if (result.summary === null) return null
  if (result.summary.kind === 'merged') return null
  return (
    <MrWarning
      text="Ticket is Done — MR still open"
      onClick={openInNewTab(result.summary.webUrl)}
    />
  )
}

function CodeReviewSection({ issueKey }: { issueKey: string }) {
  const result = useMrFor(issueKey)
  const merge = useMrMergedAction()

  if (result.state === 'idle' || result.state === 'unavailable') return null
  if (result.state === 'loading') return <SkeletonRow />

  const summary = result.summary
  if (summary === null) return <MrWarning text="No MR found" />
  if (summary.kind === 'draft') {
    return <MrWarning text="MR is draft" onClick={openInNewTab(summary.webUrl)} />
  }
  if (summary.kind === 'no-reviewers') {
    return (
      <MrWarning text="MR open, no reviewers assigned" onClick={openInNewTab(summary.webUrl)} />
    )
  }
  if (summary.kind === 'merged') {
    return (
      <MrWarning
        text={`MR is merged — move ticket to ${MERGED_TARGET_STATUS}`}
        onClick={() => merge({ key: issueKey, targetStatusName: MERGED_TARGET_STATUS })}
        viewMrUrl={summary.webUrl}
      />
    )
  }
  if (summary.kind !== 'review') return null

  const visible = summary.reviewers.slice(0, MAX_VISIBLE_REVIEWERS)
  const overflow = summary.reviewers.length - visible.length

  return (
    <div className="border-border/50 -mx-3 mt-2 -mb-2.5 border-t">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5',
          summary.allApprovedAndClean &&
            'rounded-b-md border-l-2 border-green-500/40 bg-green-500/10',
        )}
      >
        {visible.map((reviewer) => (
          <ReviewerAvatar
            key={reviewer.username}
            displayName={reviewer.displayName}
            avatarUrl={reviewer.avatarUrl}
            visualState={reviewer.visualState}
          />
        ))}
        {overflow > 0 && (
          <span className="border-border/60 text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] leading-none">
            +{overflow}
          </span>
        )}
        <MrCiIndicator state={summary.ciState} className="ml-auto" />
        {summary.unresolvedCount > 0 && (
          <span
            title={`${summary.unresolvedCount} unresolved comment thread${summary.unresolvedCount === 1 ? '' : 's'}`}
            className={cn(
              'text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums',
              summary.ciState === 'none' && 'ml-auto',
            )}
          >
            <MessageSquare className="h-3 w-3" aria-hidden />
            {summary.unresolvedCount}
          </span>
        )}
      </div>
    </div>
  )
}

function SkeletonRow() {
  return (
    <div className="border-border/50 -mx-3 mt-2 -mb-2.5 border-t" aria-hidden>
      <div className="px-3 py-1.5">
        <div className="skeleton-shimmer h-5 w-24 rounded-full" />
      </div>
    </div>
  )
}
