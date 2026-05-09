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
      className="border-destructive/40 bg-destructive/10 mx-4 mt-4 flex shrink-0 items-center gap-3 rounded-md border px-3 py-2 text-sm"
    >
      <span className="text-destructive font-medium">Couldn't reach Jira.</span>
      <span className="text-muted-foreground" title={errorMessage}>
        Retrying in {retrySeconds}s.
      </span>
      <button
        type="button"
        onClick={onRetry}
        className="text-foreground hover:bg-muted focus-visible:ring-ring ml-auto rounded px-2 py-1 text-xs underline underline-offset-2 transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        Retry now
      </button>
    </div>
  )
}
