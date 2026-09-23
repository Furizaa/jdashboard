import { match } from 'ts-pattern'
import { type KeyboardEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useHasNote, useMrFor, useWorkspaceOpen } from '~/coordinator'
import { Mr, rootStateFromPhase } from '~/widgets/mr-section'
import { FixasapRibbon } from '~/widgets/fixasap-ribbon'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { Column, MrSummary } from '~/kernel'
import type { TicketCardViewModel } from '../view-model/build-card-view'
import { CardHeader } from './CardHeader'
import { CardLabels } from './CardLabels'
import { CardTags } from './CardTags'

export type TicketCardAnimationState = 'idle' | 'entering' | 'changed' | 'leaving'

export function TicketCard({
  view,
  animationState = 'idle',
}: {
  view: TicketCardViewModel
  animationState?: TicketCardAnimationState
}) {
  const navigate = useNavigate()
  const isLeaving = animationState === 'leaving'

  // Both jira and review-real cards carry a ticket key here (review-fake opens
  // an MR and has none) — the same key that drives the "Only Workspace" filter.
  const cardIssueKey = view.bodyClick.kind === 'open-panel' ? view.bodyClick.issueKey : ''
  const workspaceOpen = useWorkspaceOpen(cardIssueKey)
  const hasNote = useHasNote(cardIssueKey)

  // Watchlist purple takes precedence over the workspace blue: a card only ever
  // carries one tint, and "on my watchlist" is its defining trait here.
  const tintClass =
    view.tint === 'watchlist'
      ? 'border-purple-500/40 bg-purple-500/10 hover:border-purple-500/60 hover:bg-purple-500/15'
      : workspaceOpen
        ? 'border-blue-500/40 bg-blue-500/10 hover:border-blue-500/60 hover:bg-blue-500/15'
        : 'border-border bg-card hover:bg-surface-2 hover:border-border-strong'

  const handleBodyClick = () => {
    if (isLeaving) return
    match(view.bodyClick)
      .with({ kind: 'open-panel' }, ({ issueKey }) => {
        // `to: '.'` keeps the current board (main or watchlist) so the detail
        // panel opens in place rather than jumping to the main board route.
        navigate({ to: '.', search: { issue: issueKey } })
      })
      .with({ kind: 'open-mr' }, ({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      })
      .exhaustive()
  }

  // The note badge deep-links into the panel with the notes pane already open.
  const openNotes = () => {
    if (cardIssueKey === '') return
    navigate({ to: '.', search: { issue: cardIssueKey, notes: true } })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleBodyClick()
    }
  }

  return (
    // article (not button): a <button> cannot legally nest the block content this card holds
    // (status pill, MR section). role + keyboard handlers preserve a11y.
    <article
      role="button"
      tabIndex={isLeaving ? -1 : 0}
      onClick={handleBodyClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${view.keyDisplay}`}
      data-testid={testIds.ticketCard}
      data-issue-key={view.keyDisplay}
      data-card-kind={view.cardKind}
      data-animation={animationState === 'idle' ? undefined : animationState}
      aria-hidden={isLeaving || undefined}
      className={cn(
        'ticket-card focus-visible:ring-ring group relative cursor-pointer rounded-lg border px-3.5 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none',
        tintClass,
        view.deemphasized && 'opacity-55',
      )}
    >
      {view.fixasap && <FixasapRibbon size="card" />}
      <CardHeader
        view={view}
        workspaceOpen={workspaceOpen}
        hasNote={hasNote}
        onOpenNotes={openNotes}
      />

      <div
        className="text-foreground mt-1.5 overflow-hidden text-[13px] leading-snug tracking-[-0.005em]"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          textOverflow: 'ellipsis',
        }}
      >
        {view.summary}
      </div>

      <CardLabels view={view} />

      <CardTags issueKey={cardIssueKey} />

      <CardMrSection mrSection={view.mrSection} />
    </article>
  )
}

function CardMrSection({ mrSection }: { mrSection: TicketCardViewModel['mrSection'] }) {
  if (mrSection === null) return null
  return match(mrSection)
    .with({ mode: 'jira' }, ({ issueKey, column }) => (
      <CardMrJira issueKey={issueKey} column={column} />
    ))
    .with({ mode: 'review' }, (review) => <CardMrReview data={review} />)
    .exhaustive()
}

function CardMrJira({ issueKey, column }: { issueKey: string; column: Column }) {
  const result = useMrFor(issueKey)
  const state = rootStateFromPhase(result.state)
  const summary = result.state === 'ready' ? result.summary : null
  return (
    <Mr.Root state={state} summary={summary} layout="row" issueKey={issueKey} column={column}>
      <Mr.ReviewerRow />
      <Mr.PriorityBadge />
      <Mr.CiIndicator />
      <Mr.UnresolvedChip />
      <Mr.WarningRow />
    </Mr.Root>
  )
}

function CardMrReview({
  data,
}: {
  data: Extract<NonNullable<TicketCardViewModel['mrSection']>, { mode: 'review' }>
}) {
  if (data.mrState === 'merged') return null
  const summary: MrSummary = {
    kind: 'review',
    iid: 0,
    title: '',
    webUrl: '',
    priority: data.priority,
    reviewers: [...data.reviewers],
    unresolvedCount: data.unresolvedCount,
    allApprovedAndClean: false,
    ciState: data.ciState,
  }
  return (
    <Mr.Root state={{ kind: 'ready' }} summary={summary} layout="row" issueKey={null} column={null}>
      <Mr.ReviewerRow />
      <Mr.PriorityBadge />
      <Mr.CiIndicator />
      <Mr.UnresolvedChip />
      <Mr.WarningRow />
    </Mr.Root>
  )
}
