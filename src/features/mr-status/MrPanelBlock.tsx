import { AlertTriangle, MessageSquare } from 'lucide-react'
import { cn } from '~/lib/cn'
import { columnForStatus, useBoardIssues } from '~/features/board'
import type { MrReviewerState } from '~/server/gitlab'
import type { CiVisualState } from './ci-state'
import { MrCiIndicator } from './MrCiIndicator'
import { ReviewerAvatar } from './ReviewerAvatar'
import { REVIEWER_BADGE_LABEL } from './reviewer-state'
import { useMrStatus } from './use-mr-statuses'

const MERGED_TARGET_STATUS = 'In STG'

export function MrPanelBlock({ issueKey }: { issueKey: string }) {
  const result = useMrStatus(issueKey)
  const board = useBoardIssues()

  if (result.state !== 'ready') return null
  const summary = result.summary
  if (summary === null) return null

  const issue = board.data?.ok ? board.data.issues.find((i) => i.key === issueKey) : null
  const column = issue ? columnForStatus(issue.statusName) : null
  const isDoneDesync = column === 'Done' && summary.kind !== 'merged'

  return (
    <BlockShell ciState={summary.kind === 'review' ? summary.ciState : null}>
      {isDoneDesync ? (
        <WarningRow text="Ticket is Done — MR still open" />
      ) : summary.kind === 'merged' ? (
        <WarningRow text={`MR is merged — move ticket to ${MERGED_TARGET_STATUS}`} />
      ) : summary.kind === 'draft' ? (
        <WarningRow text="MR is draft" />
      ) : summary.kind === 'no-reviewers' ? (
        <WarningRow text="MR open, no reviewers assigned" />
      ) : (
        <ReviewBody
          reviewers={summary.reviewers}
          unresolvedCount={summary.unresolvedCount}
          allApprovedAndClean={summary.allApprovedAndClean}
        />
      )}
    </BlockShell>
  )
}

function BlockShell({
  ciState,
  children,
}: {
  ciState: CiVisualState | null
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-[10px] tracking-wide uppercase">
          Merge Request
        </span>
        {ciState !== null && <MrCiIndicator state={ciState} />}
      </div>
      <div>{children}</div>
    </div>
  )
}

function ReviewBody({
  reviewers,
  unresolvedCount,
  allApprovedAndClean,
}: {
  reviewers: MrReviewerState[]
  unresolvedCount: number
  allApprovedAndClean: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md',
        allApprovedAndClean &&
          '-ml-2 border-l-2 border-green-500/40 bg-green-500/10 py-1.5 pr-1.5 pl-2',
      )}
    >
      <ul className="flex flex-col gap-1.5">
        {reviewers.map((reviewer) => (
          <li key={reviewer.username} className="flex items-start gap-2">
            <ReviewerAvatar
              displayName={reviewer.displayName}
              avatarUrl={reviewer.avatarUrl}
              visualState={reviewer.visualState}
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-foreground truncate text-[11px]">{reviewer.displayName}</div>
              <div className="text-muted-foreground truncate text-[10px]">
                {REVIEWER_BADGE_LABEL[reviewer.visualState]}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {unresolvedCount > 0 && (
        <div
          title={`${unresolvedCount} unresolved comment thread${unresolvedCount === 1 ? '' : 's'}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums"
        >
          <MessageSquare className="h-3 w-3" aria-hidden />
          {unresolvedCount}
        </div>
      )}
    </div>
  )
}

function WarningRow({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border-l-2 border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px]">
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
      <span className="text-foreground/90 leading-tight">{text}</span>
    </div>
  )
}
