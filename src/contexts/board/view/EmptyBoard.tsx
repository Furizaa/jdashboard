export function EmptyBoard() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="border-border bg-card max-w-md rounded-xl border p-6 shadow-lg">
        <h2 className="text-foreground text-xl font-semibold">No tickets match your filters</h2>
        <div className="text-muted-foreground mt-2 text-sm leading-relaxed">
          <p>
            The configured JQL returned zero results. This is normal when filters are tight — you
            may want to adjust{' '}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
              JIRA_PROJECT_KEY
            </code>{' '}
            or{' '}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
              JIRA_LABEL_FILTER
            </code>{' '}
            in your{' '}
            <code className="bg-muted text-foreground rounded px-1 py-0.5 font-mono text-xs">
              .env
            </code>
            .
          </p>
        </div>
      </div>
    </div>
  )
}
