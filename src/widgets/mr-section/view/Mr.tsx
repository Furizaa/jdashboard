import { createContext, useContext, type ReactNode } from 'react'
import { match } from 'ts-pattern'
import { AlertTriangle, MessageSquare } from 'lucide-react'
import { useMrMergedAction } from '~/coordinator'
import { Skeleton } from '~/design-system'
import { cn } from '~/lib/cn'
import { mrWarningKind, testIds, type MrWarningKind } from '~/lib/testids'
import { REVIEWER_BADGE_LABEL, type Column, type MrSummary } from '~/kernel'
import { MrCiIndicator } from './MrCiIndicator'
import { ReviewerAvatar } from './ReviewerAvatar'

const MERGED_TARGET_STATUS = 'In STG'
const MAX_VISIBLE_REVIEWERS = 4

type Layout = 'row' | 'stack'

export type RootState = { kind: 'idle' } | { kind: 'loading' } | { kind: 'ready' }

type CtxValue = {
  summary: MrSummary | null
  layout: Layout
  issueKey: string | null
  column: Column | null
}

const MrContext = createContext<CtxValue | null>(null)

function useMrCtx(): CtxValue {
  const ctx = useContext(MrContext)
  if (ctx === null) throw new Error('Mr.* parts must be inside Mr.Root')
  return ctx
}

function Root({
  state,
  summary,
  layout,
  issueKey,
  column,
  children,
}: {
  state: RootState
  summary: MrSummary | null
  layout: Layout
  issueKey: string | null
  column: Column | null
  children: ReactNode
}) {
  if (state.kind === 'idle') return null
  if (state.kind === 'loading') {
    if (layout === 'row') {
      return (
        <div className="border-border/50 -mx-3 mt-2 -mb-2.5 border-t" aria-hidden>
          <div className="px-3 py-1.5">
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>
      )
    }
    return null
  }

  if (layout === 'stack') {
    if (summary === null) return null
    if (column === 'Done' && summary.kind === 'merged') return null
  } else if (summary === null && column !== 'In Code Review') {
    return null
  }

  return (
    <MrContext.Provider value={{ summary, layout, issueKey, column }}>
      {layout === 'row' ? (
        <CardShell summary={summary}>{children}</CardShell>
      ) : (
        <PanelShell summary={summary}>{children}</PanelShell>
      )}
    </MrContext.Provider>
  )
}

function CardShell({ summary, children }: { summary: MrSummary | null; children: ReactNode }) {
  return (
    <div data-testid={testIds.mrSection} className="border-border/50 -mx-3 mt-2 -mb-2.5 border-t">
      {summary !== null && summary.kind === 'review' ? (
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5',
            summary.allApprovedAndClean &&
              'rounded-b-md border-l-2 border-green-500/40 bg-green-500/10',
          )}
        >
          {children}
        </div>
      ) : (
        <>{children}</>
      )}
    </div>
  )
}

function PanelShell({ summary, children }: { summary: MrSummary | null; children: ReactNode }) {
  const ciState = summary !== null && summary.kind === 'review' ? summary.ciState : null
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

function ReviewerRow() {
  const ctx = useMrCtx()
  if (ctx.layout !== 'row') return null
  if (ctx.summary === null || ctx.summary.kind !== 'review') return null
  const visible = ctx.summary.reviewers.slice(0, MAX_VISIBLE_REVIEWERS)
  const overflow = ctx.summary.reviewers.length - visible.length
  return (
    <>
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
    </>
  )
}

function ReviewerStack() {
  const ctx = useMrCtx()
  if (ctx.layout !== 'stack') return null
  if (ctx.summary === null || ctx.summary.kind !== 'review') return null
  const summary = ctx.summary
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-md',
        summary.allApprovedAndClean &&
          '-ml-2 border-l-2 border-green-500/40 bg-green-500/10 py-1.5 pr-1.5 pl-2',
      )}
    >
      <ul className="flex flex-col gap-1.5">
        {summary.reviewers.map((reviewer) => (
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
      {summary.unresolvedCount > 0 && (
        <div
          title={`${summary.unresolvedCount} unresolved comment thread${summary.unresolvedCount === 1 ? '' : 's'}`}
          className="text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums"
        >
          <MessageSquare className="h-3 w-3" aria-hidden />
          {summary.unresolvedCount}
        </div>
      )}
    </div>
  )
}

function CiIndicator() {
  const ctx = useMrCtx()
  if (ctx.layout !== 'row') return null
  if (ctx.summary === null || ctx.summary.kind !== 'review') return null
  if (ctx.summary.ciState === 'none') return null
  return <MrCiIndicator state={ctx.summary.ciState} className="ml-auto" />
}

function UnresolvedChip() {
  const ctx = useMrCtx()
  if (ctx.layout !== 'row') return null
  if (ctx.summary === null || ctx.summary.kind !== 'review') return null
  if (ctx.summary.unresolvedCount === 0) return null
  const count = ctx.summary.unresolvedCount
  const ciIsNone = ctx.summary.ciState === 'none'
  return (
    <span
      data-testid={testIds.unresolvedThreadChip}
      title={`${count} unresolved comment thread${count === 1 ? '' : 's'}`}
      className={cn(
        'text-muted-foreground inline-flex items-center gap-1 text-[11px] tabular-nums',
        ciIsNone && 'ml-auto',
      )}
    >
      <MessageSquare className="h-3 w-3" aria-hidden />
      {count}
    </span>
  )
}

type WarningInfo = {
  kind: MrWarningKind
  text: string
  webUrl?: string
  onClick?: () => void
}

function pickWarning(
  ctx: CtxValue,
  triggerMerge: (input: { key: string; targetStatusName: string }) => Promise<unknown>,
): WarningInfo | null {
  const { summary, column, issueKey } = ctx
  if (summary === null) {
    if (column === 'In Code Review') return { kind: mrWarningKind.noMr, text: 'No MR found' }
    return null
  }
  if (summary.kind === 'review') return null
  if (column === 'Done') {
    if (summary.kind === 'merged') return null
    return {
      kind: mrWarningKind.doneStillOpen,
      text: 'Ticket is Done — MR still open',
      webUrl: summary.webUrl,
    }
  }
  return match(summary)
    .with({ kind: 'draft' }, (s) => ({
      kind: mrWarningKind.draft,
      text: 'MR is draft',
      webUrl: s.webUrl,
    }))
    .with({ kind: 'no-reviewers' }, (s) => ({
      kind: mrWarningKind.noReviewers,
      text: 'MR open, no reviewers assigned',
      webUrl: s.webUrl,
    }))
    .with({ kind: 'merged' }, (s) => ({
      kind: mrWarningKind.mergedDesync,
      text: `MR is merged — move ticket to ${MERGED_TARGET_STATUS}`,
      webUrl: s.webUrl,
      onClick:
        issueKey === null
          ? undefined
          : () => {
              void triggerMerge({ key: issueKey, targetStatusName: MERGED_TARGET_STATUS })
            },
    }))
    .exhaustive()
}

const CARD_WARNING_ROW_CLASS =
  'flex items-center gap-2 bg-amber-500/10 border-l-2 border-amber-500/40 rounded-b-md px-3 py-1.5 text-[11px]'

function WarningRow() {
  const ctx = useMrCtx()
  const merge = useMrMergedAction()
  const warning = pickWarning(ctx, merge)
  if (warning === null) return null

  if (ctx.layout === 'stack') {
    return (
      <div
        data-testid={testIds.mrWarningRow}
        data-kind={warning.kind}
        className="flex items-start gap-2 rounded-md border-l-2 border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px]"
      >
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
        <span className="text-foreground/90 leading-tight">{warning.text}</span>
      </div>
    )
  }

  const icon = <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
  const label = <span className="text-foreground/90">{warning.text}</span>
  const link =
    warning.webUrl !== undefined ? (
      <a
        href={warning.webUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-muted-foreground hover:text-foreground ml-auto text-[11px] hover:underline"
      >
        View MR ↗
      </a>
    ) : null

  if (warning.onClick !== undefined) {
    return (
      <button
        type="button"
        data-testid={testIds.mrWarningRow}
        data-kind={warning.kind}
        onClick={warning.onClick}
        className={cn(CARD_WARNING_ROW_CLASS, 'w-full text-left hover:bg-amber-500/15')}
      >
        {icon}
        {label}
        {link}
      </button>
    )
  }
  return (
    <div
      data-testid={testIds.mrWarningRow}
      data-kind={warning.kind}
      className={CARD_WARNING_ROW_CLASS}
    >
      {icon}
      {label}
      {link}
    </div>
  )
}

function OpenLink() {
  return null
}

export const Mr = {
  Root,
  ReviewerRow,
  ReviewerStack,
  CiIndicator,
  UnresolvedChip,
  WarningRow,
  OpenLink,
}
