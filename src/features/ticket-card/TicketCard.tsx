import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { toast } from 'sonner'
import type { BoardIssue } from '~/server/jira'
import { StatusPill } from '~/features/status-pill'
import { TypeIcon } from './TypeIcon'
import { colorForLabel } from './hash-color'

const MAX_VISIBLE_LABELS = 3
const COPIED_INDICATOR_MS = 1500

export function TicketCard({ issue, baseUrl }: { issue: BoardIssue; baseUrl: string }) {
  const visible = issue.labels.slice(0, MAX_VISIBLE_LABELS)
  const overflow = issue.labels.length - visible.length
  const jiraUrl = `${baseUrl}/browse/${issue.key}`

  return (
    <article className="border-border bg-card hover:border-foreground/30 group rounded-md border px-3 py-2.5 shadow-sm transition-colors">
      <div className="flex items-center gap-2">
        <TypeIcon type={issue.typeName} />
        <CardKey jiraKey={issue.key} jiraUrl={jiraUrl} />
        <span className="ml-auto">
          <StatusPill status={issue.statusName} />
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

      {issue.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
    </article>
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
