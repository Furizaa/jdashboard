import { Terminal } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { reviewMr } from '~/server/server-functions/detail'
import { useMrRef } from '../presenter'

export function ReviewMrButton({ issueKey }: { issueKey: string }) {
  const mr = useMrRef(issueKey)
  const [pending, setPending] = useState(false)
  if (mr === null) return null

  const handleClick = async () => {
    setPending(true)
    try {
      const result = await reviewMr({ data: { iid: mr.iid } })
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
      className="border-border bg-surface-1 text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-full items-center justify-center gap-1.5 rounded-md border px-2 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Terminal size={12} />
      <span>Review MR</span>
    </button>
  )
}
