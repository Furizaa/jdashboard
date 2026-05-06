import { useQuery } from '@tanstack/react-query'
import { getTransitions } from '~/server/jira'

export const transitionsQueryKey = (key: string) => ['jira', 'transitions', key] as const

export function useTransitions(key: string, enabled: boolean) {
  return useQuery({
    queryKey: transitionsQueryKey(key),
    queryFn: () => getTransitions({ data: { key } }),
    enabled,
    retry: false,
    staleTime: 0,
  })
}
