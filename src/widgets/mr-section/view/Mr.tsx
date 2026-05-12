import { createContext, useContext, useMemo, type ReactNode } from 'react'
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

export type MrFetchPhase = 'idle' | 'loading' | 'unavailable' | 'ready'

export function rootStateFromPhase(phase: MrFetchPhase): RootState {
  if (phase === 'loading') return { kind: 'loading' }
  if (phase === 'ready') return { kind: 'ready' }
  return { kind: 'idle' }
}

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

type ReviewSummary = Extract<MrSummary, { kind: 'review' }>

function useReviewSummary(layout: Layout): ReviewSummary | null {
  const ctx = useMrCtx()
  if (ctx.layout !== layout) return null
  if (ctx.summary === null || ctx.summary.kind !== 'review') return null
  return ctx.summary
}

function unresolvedTitle(count: number): string {
  return `${count} unresolved comment thread${count === 1 ? '' : 's'}`
}

function shouldHideReady(
  layout: Layout,
  summary: MrSummary | null,
  column: Column | null,
): boolean {
  if (summary === null) {
    if (layout === 'stack') return true
    return column !== 'In Code Review'
  }
  // Done + merged renders no warning and no review row — every child returns
  // null, leaving only the divider. Hide the shell entirely in both layouts.
  return column === 'Done' && summary.kind === 'merged'
}

function LoadingSkeleton({ layout }: { layout: Layout }) {
  if (layout !== 'row') return null
  return (
    <div className="border-border -mx-3.5 mt-2.5 -mb-3 border-t" aria-hidden>
      <div className="px-3.5 py-2">
        <Skeleton className="h-5 w-24 rounded-full" />
      </div>
    </div>
  )
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
  const ctxValue = useMemo(
    () => ({ summary, layout, issueKey, column }),
    [summary, layout, issueKey, column],
  )

  if (state.kind === 'idle') return null
  if (state.kind === 'loading') return <LoadingSkeleton layout={layout} />
  if (shouldHideReady(layout, summary, column)) return null

  return (
    <MrContext.Provider value={ctxValue}>
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
    <div data-testid={testIds.mrSection} className="border-border -mx-3.5 mt-2.5 -mb-3 border-t">
      {summary !== null && summary.kind === 'review' ? (
        <div
          className={cn(
            'flex items-center gap-2 px-3.5 py-2',
            summary.allApprovedAndClean &&
              'rounded-b-lg border-l-2 border-[oklch(0.68_0.18_145/_0.5)] bg-[oklch(0.68_0.18_145/_0.08)]',
          )}
        >
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  )
}

function PanelShell({ summary, children }: { summary: MrSummary | null; children: ReactNode }) {
  const ciState = summary !== null && summary.kind === 'review' ? summary.ciState : null
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink-tertiary text-[10px] font-medium tracking-[0.06em] uppercase">
          Merge Request
        </span>
        {ciState !== null && <MrCiIndicator state={ciState} />}
      </div>
      <div>{children}</div>
    </div>
  )
}

function ReviewerRow() {
  const summary = useReviewSummary('row')
  if (summary === null) return null
  const visible = summary.reviewers.slice(0, MAX_VISIBLE_REVIEWERS)
  const overflow = summary.reviewers.length - visible.length
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
        <span className="border-border text-ink-subtle rounded-full border px-1.5 py-0.5 text-[10px] leading-none">
          +{overflow}
        </span>
      )}
    </>
  )
}

function ReviewerStack() {
  const summary = useReviewSummary('stack')
  if (summary === null) return null
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md',
        summary.allApprovedAndClean &&
          '-ml-2 border-l-2 border-[oklch(0.68_0.18_145/_0.5)] bg-[oklch(0.68_0.18_145/_0.08)] py-2 pr-2 pl-2.5',
      )}
    >
      <ul className="flex flex-col gap-2">
        {summary.reviewers.map((reviewer) => (
          <ReviewerStackRow key={reviewer.username} reviewer={reviewer} />
        ))}
      </ul>
      {summary.unresolvedCount > 0 && (
        <div
          title={unresolvedTitle(summary.unresolvedCount)}
          className="text-ink-subtle inline-flex items-center gap-1 text-[11px] tabular-nums"
        >
          <MessageSquare className="h-3 w-3" aria-hidden />
          {summary.unresolvedCount}
        </div>
      )}
    </div>
  )
}

function ReviewerStackRow({ reviewer }: { reviewer: ReviewSummary['reviewers'][number] }) {
  return (
    <li className="flex items-start gap-2">
      <ReviewerAvatar
        displayName={reviewer.displayName}
        avatarUrl={reviewer.avatarUrl}
        visualState={reviewer.visualState}
      />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-foreground truncate text-[12px]">{reviewer.displayName}</div>
        <div className="text-ink-tertiary truncate text-[10px]">
          {REVIEWER_BADGE_LABEL[reviewer.visualState]}
        </div>
      </div>
    </li>
  )
}

function CiIndicator() {
  const summary = useReviewSummary('row')
  if (summary === null || summary.ciState === 'none') return null
  return <MrCiIndicator state={summary.ciState} className="ml-auto" />
}

function UnresolvedChip() {
  const summary = useReviewSummary('row')
  if (summary === null || summary.unresolvedCount === 0) return null
  const count = summary.unresolvedCount
  return (
    <span
      data-testid={testIds.unresolvedThreadChip}
      title={unresolvedTitle(count)}
      className={cn(
        'text-ink-subtle inline-flex items-center gap-1 text-[11px] tabular-nums',
        summary.ciState === 'none' && 'ml-auto',
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

type AuthorSummary = Exclude<MrSummary, { kind: 'review' }>
type TriggerMerge = (input: { key: string; targetStatusName: string }) => Promise<unknown>

function warningForAuthorSummary(
  summary: AuthorSummary,
  issueKey: string | null,
  triggerMerge: TriggerMerge,
): WarningInfo {
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

function pickWarning(ctx: CtxValue, triggerMerge: TriggerMerge): WarningInfo | null {
  const { summary, column, issueKey } = ctx
  if (summary === null) {
    return column === 'In Code Review' ? { kind: mrWarningKind.noMr, text: 'No MR found' } : null
  }
  if (summary.kind === 'review') return null
  if (column === 'Done') {
    return summary.kind === 'merged'
      ? null
      : {
          kind: mrWarningKind.doneStillOpen,
          text: 'Ticket is Done — MR still open',
          webUrl: summary.webUrl,
        }
  }
  return warningForAuthorSummary(summary, issueKey, triggerMerge)
}

const CARD_WARNING_ROW_CLASS =
  'flex items-center gap-2 bg-amber-500/10 border-l-2 border-amber-500/50 rounded-b-lg px-3.5 py-2 text-[11px]'

function WarningRow() {
  const ctx = useMrCtx()
  const merge = useMrMergedAction()
  const warning = pickWarning(ctx, merge)
  if (warning === null) return null
  if (ctx.layout === 'stack') return <StackWarning warning={warning} />
  return <CardWarning warning={warning} />
}

function StackWarning({ warning }: { warning: WarningInfo }) {
  return (
    <div
      data-testid={testIds.mrWarningRow}
      data-kind={warning.kind}
      className="flex items-start gap-2 rounded-md border-l-2 border-amber-500/50 bg-amber-500/10 px-2.5 py-2 text-[11px]"
    >
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" aria-hidden />
      <span className="text-foreground/90 leading-tight">{warning.text}</span>
    </div>
  )
}

function CardWarning({ warning }: { warning: WarningInfo }) {
  const icon = <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
  const label = <span className="text-foreground/90">{warning.text}</span>
  const link =
    warning.webUrl !== undefined ? (
      <a
        href={warning.webUrl}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="text-ink-subtle hover:text-foreground ml-auto text-[11px] hover:underline"
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
