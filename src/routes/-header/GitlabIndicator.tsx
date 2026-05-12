import { useQuery } from '@tanstack/react-query'
import { getGitlabUser } from '~/server/server-functions/review'

export function GitlabIndicator() {
  const query = useQuery({
    queryKey: ['gitlab', 'user'],
    queryFn: () => getGitlabUser(),
    retry: false,
    staleTime: 60_000,
  })

  if (query.isPending || query.isError) return null

  const wire = query.data
  if (wire.ok === false) {
    return (
      <span
        className="text-ink-tertiary border-border bg-surface-1 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
        title="GitLab token rejected (HTTP 401)"
      >
        <span aria-hidden className="size-1.5 rounded-full bg-[oklch(0.65_0.22_25)]" />
        GitLab
      </span>
    )
  }

  return (
    <span
      className="text-ink-subtle border-border bg-surface-1 inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]"
      title={wire.displayName}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[oklch(0.68_0.18_145)]" />
      <span className="font-mono text-[10px]">{wire.username}</span>
    </span>
  )
}
