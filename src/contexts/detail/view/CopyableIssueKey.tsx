import { useEffect, useRef, useState } from 'react'

const COPIED_INDICATOR_MS = 1500

export function CopyableIssueKey({
  issueKey,
  onCopy,
}: {
  issueKey: string
  onCopy: (() => void) | null
}) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    },
    [],
  )

  if (onCopy === null) {
    return <span className="text-foreground">{issueKey}</span>
  }

  const handleClick = () => {
    onCopy()
    setCopied(true)
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => setCopied(false), COPIED_INDICATOR_MS)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Copy Jira URL for ${issueKey}`}
      className="text-foreground decoration-muted-foreground/60 focus-visible:ring-ring rounded underline decoration-dotted underline-offset-[3px] transition-colors hover:decoration-solid focus-visible:ring-1 focus-visible:outline-none"
    >
      {copied ? 'Copied' : issueKey}
    </button>
  )
}
