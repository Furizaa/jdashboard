import { useQuery } from '@tanstack/react-query'
import { searchIssues } from '~/server/jira'

export const boardIssuesQueryKey = ['jira', 'board', 'issues'] as const

export function useBoardIssues() {
  return useQuery({
    queryKey: boardIssuesQueryKey,
    queryFn: () => searchIssues(),
    retry: false,
    staleTime: 30_000,
  })
}
