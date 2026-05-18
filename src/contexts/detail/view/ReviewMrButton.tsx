import { Terminal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useMrFor, useReviewCards } from '~/coordinator'
import type { GetReviewCardsResult } from '~/kernel'
import { reviewMr } from '~/server/server-functions/detail'

function findReviewMrIid(data: GetReviewCardsResult | undefined, issueKey: string): number | null {
  if (data === undefined || data.ok !== true) return null
  for (const card of data.cards) {
    if (card.kind === 'review-real' && card.jira.key === issueKey) return card.iid
  }
  return null
}

export function ReviewMrButton({ issueKey }: { issueKey: string }) {
  const authorResult = useMrFor(issueKey)
  const reviewQuery = useReviewCards()
  const [pending, setPending] = useState(false)

  const authorIid =
    authorResult.state === 'ready' && authorResult.summary !== null
      ? authorResult.summary.iid
      : null
  const iid = authorIid ?? findReviewMrIid(reviewQuery.data, issueKey)
  if (iid === null) return null

  const handleClick = async () => {
    setPending(true)
    try {
      const result = await reviewMr({ data: { iid } })
      if (!result.ok) toast.error(`Review MR failed: ${result.error.message}`)
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label="Review MR in terminal"
      className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <span>Review MR</span>
      <Terminal size={12} />
    </button>
  )
}
