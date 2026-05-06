import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { BoardIssue } from '~/server/jira'
import { StatusPillSelect } from '~/features/status-pill'
import { MrSection } from '~/features/mr-status'
import type { Column } from '~/features/board/status-mapping'
import { isDeemphasized } from '~/features/board/deemphasize'
import { cn } from '~/lib/cn'
import { TypeIcon } from './TypeIcon'
import { colorForLabel } from './hash-color'

const MAX_VISIBLE_LABELS = 3
const COPIED_INDICATOR_MS = 1500

export type TicketCardAnimationState = 'idle' | 'entering' | 'changed' | 'leaving'

function stopPropagation(event: MouseEvent) {
  event.stopPropagation()
}

export function TicketCard({
  issue,
  baseUrl,
  column,
  animationState = 'idle',
}: {
  issue: BoardIssue
  baseUrl: string
  column: Column
  animationState?: TicketCardAnimationState
}) {
  const visible = issue.labels.slice(0, MAX_VISIBLE_LABELS)
  const overflow = issue.labels.length - visible.length
  const jiraUrl = `${baseUrl}/browse/${issue.key}`
  const navigate = useNavigate()
  const isLeaving = animationState === 'leaving'

  const openPanel = () => {
    if (isLeaving) return
    navigate({ to: '/', search: { issue: issue.key } })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openPanel()
    }
  }

  return (
    <article
      role="button"
      tabIndex={isLeaving ? -1 : 0}
      onClick={openPanel}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${issue.key}`}
      data-animation={animationState === 'idle' ? undefined : animationState}
      aria-hidden={isLeaving || undefined}
      className={cn(
        'ticket-card border-border bg-card hover:border-foreground/30 focus-visible:ring-ring group cursor-pointer rounded-md border px-3 py-2.5 text-left shadow-sm transition-colors focus-visible:ring-1 focus-visible:outline-none',
        isDeemphasized(issue, column) && 'opacity-60',
      )}
    >
      <div className="flex items-center gap-2">
        <TypeIcon type={issue.typeName} />
        <CardKey jiraKey={issue.key} jiraUrl={jiraUrl} />
        <span className="ml-auto" onClick={stopPropagation}>
          <StatusPillSelect issueKey={issue.key} status={issue.statusName} align="end" />
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
        {issue.summary}
      </div>

      {(issue.epic !== null || issue.labels.length > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1" onClick={stopPropagation}>
          {issue.epic !== null && <EpicChip epic={issue.epic} />}
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

      <MrSection issueKey={issue.key} column={column} />
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

function CardKey({ jiraKey, jiraUrl }: { jiraKey: string; jiraUrl: string }) {
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
    if (event.metaKey || event.ctrlKey) {
      window.open(jiraUrl, '_blank', 'noopener,noreferrer')
      return
    }
    try {
      await navigator.clipboard.writeText(jiraUrl)
      setCopied(true)
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_INDICATOR_MS)
    } catch {
      toast.error("Couldn't copy link to clipboard")
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Copy Jira URL for ${jiraKey} (Cmd/Ctrl-click to open)`}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded font-mono text-xs transition-colors focus-visible:ring-1 focus-visible:outline-none"
    >
      {copied ? 'Copied' : jiraKey}
    </button>
  )
}
