import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { match } from 'ts-pattern'
import { toast } from 'sonner'
import type { TicketCardViewModel } from '../view-model/build-card-view'

const COPIED_INDICATOR_MS = 1500

export function CardKey({
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

  const ariaLabel = match(keyClick)
    .with({ kind: 'open-mr' }, () => `Open MR for ${keyDisplay}`)
    .with({ kind: 'copy-jira' }, () => `Copy Jira URL for ${keyDisplay} (Cmd/Ctrl-click to open)`)
    .exhaustive()

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={ariaLabel}
      className="text-muted-foreground hover:text-foreground decoration-muted-foreground/50 focus-visible:ring-ring rounded font-mono text-xs underline decoration-dotted underline-offset-[3px] transition-colors hover:decoration-solid focus-visible:ring-1 focus-visible:outline-none"
    >
      {copied ? 'Copied' : keyDisplay}
    </button>
  )
}
