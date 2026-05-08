import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { StatusPill, StatusPillSelect } from '~/features/status-pill'
import { MrSection } from '~/features/mr-status'
import { cn } from '~/lib/cn'
import type { TicketCardViewModel } from './build-card-view'
import { TypeIcon } from './TypeIcon'
import { colorForLabel } from './hash-color'
import { FixasapRibbon } from './FixasapRibbon'

const MAX_VISIBLE_LABELS = 3
const COPIED_INDICATOR_MS = 1500

export type TicketCardAnimationState = 'idle' | 'entering' | 'changed' | 'leaving'

function stopPropagation(event: MouseEvent) {
  event.stopPropagation()
}

export function TicketCard({
  view,
  animationState = 'idle',
}: {
  view: TicketCardViewModel
  animationState?: TicketCardAnimationState
}) {
  const navigate = useNavigate()
  const isLeaving = animationState === 'leaving'
  const visible = view.labels.slice(0, MAX_VISIBLE_LABELS)
  const overflow = view.labels.length - visible.length

  const handleBodyClick = () => {
    if (isLeaving) return
    if (view.bodyClick.kind === 'open-panel') {
      navigate({ to: '/', search: { issue: view.bodyClick.issueKey } })
    } else {
      window.open(view.bodyClick.url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleBodyClick()
    }
  }

  return (
    <article
      role="button"
      tabIndex={isLeaving ? -1 : 0}
      onClick={handleBodyClick}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${view.keyDisplay}`}
      data-animation={animationState === 'idle' ? undefined : animationState}
      aria-hidden={isLeaving || undefined}
      className={cn(
        'ticket-card border-border bg-card hover:border-foreground/30 focus-visible:ring-ring group relative cursor-pointer rounded-md border px-3 py-2.5 text-left shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none',
        view.deemphasized && 'opacity-60',
      )}
    >
      {view.fixasap && <FixasapRibbon size="card" />}
      <div className="flex items-center gap-2">
        {view.typeIcon.kind === 'merge-request' ? (
          <TypeIcon kind="merge-request" />
        ) : (
          <TypeIcon type={view.typeIcon.type} />
        )}
        <CardKey
          keyDisplay={view.keyDisplay}
          keyClick={view.keyClick}
          keyOpenInJira={view.keyOpenInJira}
        />
        <span className="ml-auto" onClick={stopPropagation}>
          {view.pill.clickable ? (
            <StatusPillSelect
              issueKey={view.bodyClick.kind === 'open-panel' ? view.bodyClick.issueKey : ''}
              status={view.pill.text}
              align="end"
            />
          ) : (
            <StatusPill status={view.pill.text} />
          )}
        </span>
      </div>

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

      {(view.epic !== null || view.labels.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" onClick={stopPropagation}>
          {view.epic !== null && <EpicChip epic={view.epic} />}
          {visible.map((label) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorForLabel(label) }}
              />
              <span className="text-muted-foreground text-[11px] leading-none">{label}</span>
            </span>
          ))}
          {overflow > 0 && (
            <span className="border-border/60 text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] leading-none">
              +{overflow}
            </span>
          )}
        </div>
      )}

      {view.mrSection !== null &&
        (view.mrSection.mode === 'jira' ? (
          <MrSection
            mode="jira"
            issueKey={view.mrSection.issueKey}
            column={view.mrSection.column}
          />
        ) : (
          <MrSection
            mode="review"
            mrState={view.mrSection.mrState}
            reviewers={view.mrSection.reviewers}
            unresolvedCount={view.mrSection.unresolvedCount}
            ciState={view.mrSection.ciState}
          />
        ))}
    </article>
  )
}

function EpicChip({ epic }: { epic: { key: string; summary: string } }) {
  const color = colorForLabel(epic.key)
  return (
    <span
      title={`${epic.key} — ${epic.summary}`}
      className="inline-flex max-w-[140px] items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] leading-none font-medium"
      style={{ backgroundColor: `${color}26`, color }}
    >
      <span className="truncate">{epic.summary}</span>
    </span>
  )
}

function CardKey({
  keyDisplay,
  keyClick,
  keyOpenInJira,
}: {
  keyDisplay: string
  keyClick: TicketCardViewModel['keyClick']
  keyOpenInJira: string | null
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    },
    [],
  )

  async function handleClick(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    if (keyClick.kind === 'open-mr') {
      window.open(keyClick.url, '_blank', 'noopener,noreferrer')
      return
    }
    if ((event.metaKey || event.ctrlKey) && keyOpenInJira !== null) {
      window.open(keyOpenInJira, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      await navigator.clipboard.writeText(keyClick.url)
      setCopied(true)
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_INDICATOR_MS)
    } catch {
      toast.error("Couldn't copy link to clipboard")
    }
  }

  const ariaLabel =
    keyClick.kind === 'open-mr'
      ? `Open MR for ${keyDisplay}`
      : `Copy Jira URL for ${keyDisplay} (Cmd/Ctrl-click to open)`

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded font-mono text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      {copied ? 'Copied' : keyDisplay}
    </button>
  )
}
