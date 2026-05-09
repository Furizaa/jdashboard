import { MessageSquare } from 'lucide-react'
import { cn } from '~/lib/cn'
import type { Column } from '~/features/board/status-mapping'
import { useMrFor, useMrMergedAction } from '~/dashboard'
import { mrWarningKind, testIds } from '~/lib/testids'
import { MrCiIndicator } from './MrCiIndicator'
import { MrWarning } from './MrWarning'
import { ReviewerAvatar } from './ReviewerAvatar'
import type { CiVisualState } from './ci-state'
import type { ReviewerVisualState } from './reviewer-state'

const MAX_VISIBLE_REVIEWERS = 4
const MERGED_TARGET_STATUS = 'In STG'

type ReviewerVisual = {
  username: string
  displayName: string
  avatarUrl: string | null
  visualState: ReviewerVisualState
}

export type MrSectionProps =
  | { mode: 'jira'; issueKey: string; column: Column }
  | {
      mode: 'review'
      mrState: 'opened' | 'merged'
      reviewers: readonly ReviewerVisual[]
      unresolvedCount: number
      ciState: CiVisualState
    }

function openInNewTab(url: string) {
  return () => {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

export function MrSection(props: MrSectionProps) {
  if (props.mode === 'jira') {
    if (props.column === 'In Code Review') return <CodeReviewSection issueKey={props.issueKey} />
    if (props.column === 'Done') return <DoneSection issueKey={props.issueKey} />
    return null
  }
  if (props.mrState === 'merged') return null
  return (
    <ReviewerRow
      reviewers={props.reviewers}
      unresolvedCount={props.unresolvedCount}
      ciState={props.ciState}
      allApprovedAndClean={false}
    />
  )
}

function DoneSection({ issueKey }: { issueKey: string }) {
  const result = useMrFor(issueKey)
  if (result.state !== 'ready') return null
  if (result.summary === null) return null
  if (result.summary.kind === 'merged') return null
  return (
    <MrWarning
      kind={mrWarningKind.doneStillOpen}
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
  if (summary === null) return <MrWarning kind={mrWarningKind.noMr} text="No MR found" />
  if (summary.kind === 'draft') {
    return (
      <MrWarning
        kind={mrWarningKind.draft}
        text="MR is draft"
        onClick={openInNewTab(summary.webUrl)}
      />
    )
  }
  if (summary.kind === 'no-reviewers') {
    return (
      <MrWarning
        kind={mrWarningKind.noReviewers}
        text="MR open, no reviewers assigned"
        onClick={openInNewTab(summary.webUrl)}
      />
    )
  }
  if (summary.kind === 'merged') {
    return (
      <MrWarning
        kind={mrWarningKind.mergedDesync}
        text={`MR is merged — move ticket to ${MERGED_TARGET_STATUS}`}
        onClick={() => merge({ key: issueKey, targetStatusName: MERGED_TARGET_STATUS })}
        viewMrUrl={summary.webUrl}
      />
    )
  }
  if (summary.kind !== 'review') return null

  return (
    <ReviewerRow
      reviewers={summary.reviewers}
      unresolvedCount={summary.unresolvedCount}
      ciState={summary.ciState}
      allApprovedAndClean={summary.allApprovedAndClean}
    />
  )
}

function ReviewerRow({
  reviewers,
  unresolvedCount,
  ciState,
  allApprovedAndClean,
}: {
  reviewers: readonly ReviewerVisual[]
  unresolvedCount: number
  ciState: CiVisualState
  allApprovedAndClean: boolean
}) {
  const visible = reviewers.slice(0, MAX_VISIBLE_REVIEWERS)
  const overflow = reviewers.length - visible.length
  return (
    <div data-testid={testIds.mrSection} className="border-border/50 -mx-3 mt-2 -mb-2.5 border-t">
      <div
        className={cn(
          'flex items-center gap-2 px-3 py-1.5',
          allApprovedAndClean && 'rounded-b-md border-l-2 border-green-500/40 bg-green-500/10',
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
        <MrCiIndicator state={ciState} className="ml-auto" />
        {unresolvedCount > 0 && (
          <span
            data-testid={testIds.unresolvedThreadChip}
            title={`${unresolvedCount} unresolved comment thread${unresolvedCount === 1 ? '' : 's'}`}
            className={cn(
              'text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums',
              ciState === 'none' && 'ml-auto',
            )}
          >
            <MessageSquare className="h-3 w-3" aria-hidden />
            {unresolvedCount}
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
