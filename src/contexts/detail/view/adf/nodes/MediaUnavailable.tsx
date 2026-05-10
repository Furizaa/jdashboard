export function MediaUnavailable({ jiraBaseUrl }: { jiraBaseUrl?: string }) {
  return (
    <span className="border-border bg-muted/40 text-muted-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
      <span>Media unavailable</span>
      {jiraBaseUrl !== undefined && (
        <a
          href={jiraBaseUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          Open in Jira
        </a>
      )}
    </span>
  )
}
