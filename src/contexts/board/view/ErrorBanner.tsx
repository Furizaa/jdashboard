import { BOARD_POLL_INTERVAL_MS } from '../presenter'

export function ErrorBanner({
  errorMessage,
  onRetry,
}: {
  errorMessage: string | undefined
  onRetry: () => void
}) {
  const retrySeconds = Math.round(BOARD_POLL_INTERVAL_MS / 1000)
  return (
    <div
      role="alert"
      className="border-destructive/30 bg-destructive/[0.08] mx-5 mt-5 flex shrink-0 items-center gap-3 rounded-lg border px-3.5 py-2.5 text-sm"
    >
      <span className="text-destructive font-medium">Couldn&apos;t reach Jira.</span>
      <span className="text-ink-subtle" title={errorMessage}>
        Retrying in {retrySeconds}s.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="text-foreground hover:bg-surface-2 focus-visible:ring-ring ml-auto rounded-md px-2.5 py-1 text-xs underline underline-offset-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        Retry now
      </button>
    </div>
  )
}
