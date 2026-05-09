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

  if (query.data.ok === false) {
    return (
      <span
        className="text-muted-foreground/60 rounded px-2 py-1 text-xs"
        title="GitLab token rejected (HTTP 401)"
      >
        GitLab ✗
      </span>
    )
  }

  return (
    <span
      className="text-muted-foreground rounded px-2 py-1 text-xs"
      title={query.data.displayName}
    >
      GitLab ✓ {query.data.username}
    </span>
  )
}
