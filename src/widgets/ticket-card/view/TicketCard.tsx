import { match } from 'ts-pattern'
import { type KeyboardEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useMrFor } from '~/coordinator'
import { Mr, type RootState } from '~/widgets/mr-section'
import { FixasapRibbon } from '~/widgets/fixasap-ribbon'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { Column, MrSummary } from '~/kernel'
import type { TicketCardViewModel } from '../view-model/build-card-view'
import { CardHeader } from './CardHeader'
import { CardLabels } from './CardLabels'

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

  const handleBodyClick = () => {
    if (isLeaving) return
    match(view.bodyClick)
      .with({ kind: 'open-panel' }, ({ issueKey }) => {
        navigate({ to: '/', search: { issue: issueKey } })
      })
      .with({ kind: 'open-mr' }, ({ url }) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      })
      .exhaustive()
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
        'ticket-card border-border bg-card hover:border-foreground/30 focus-visible:ring-ring group relative cursor-pointer rounded-md border px-3 py-2.5 text-left shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none',
        view.deemphasized && 'opacity-60',
      )}
    >
      {view.fixasap && <FixasapRibbon size="card" />}
      <CardHeader view={view} />

      <div
        className="text-foreground mt-1.5 overflow-hidden text-sm leading-snug"
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

      {view.mrSection !== null &&
        match(view.mrSection)
          .with({ mode: 'jira' }, ({ issueKey, column }) => (
            <CardMrJira issueKey={issueKey} column={column} />
          ))
          .with({ mode: 'review' }, (review) => <CardMrReview data={review} />)
          .exhaustive()}
    </article>
  )
}

function CardMrJira({ issueKey, column }: { issueKey: string; column: Column }) {
  const result = useMrFor(issueKey)
  const state = mrStatusToRootState(result.state)
  const summary = result.state === 'ready' ? result.summary : null
  return (
    <Mr.Root state={state} summary={summary} layout="row" issueKey={issueKey} column={column}>
      <Mr.ReviewerRow />
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
    reviewers: [...data.reviewers],
    unresolvedCount: data.unresolvedCount,
    allApprovedAndClean: false,
    ciState: data.ciState,
  }
  return (
    <Mr.Root state={{ kind: 'ready' }} summary={summary} layout="row" issueKey={null} column={null}>
      <Mr.ReviewerRow />
      <Mr.CiIndicator />
      <Mr.UnresolvedChip />
      <Mr.WarningRow />
    </Mr.Root>
  )
}

function mrStatusToRootState(state: 'idle' | 'loading' | 'unavailable' | 'ready'): RootState {
  return match(state)
    .with('idle', () => ({ kind: 'idle' }) as RootState)
    .with('unavailable', () => ({ kind: 'idle' }) as RootState)
    .with('loading', () => ({ kind: 'loading' }) as RootState)
    .with('ready', () => ({ kind: 'ready' }) as RootState)
    .exhaustive()
}
