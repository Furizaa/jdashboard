import { useQuery } from '@tanstack/react-query'
import { getIssue } from '~/server/jira'

export const issueQueryKey = (key: string) => ['jira', 'issue', key] as const

export function useIssue(key: string | null) {
  return useQuery({
    queryKey: key ? issueQueryKey(key) : ['jira', 'issue', '__none__'],
    queryFn: () => getIssue({ data: { key: key as string } }),
    enabled: key !== null,
    retry: false,
    staleTime: 30_000,
  })
}
