import { useQuery } from '@tanstack/react-query'
import { getMyEpics } from '~/server/jira'

export const myEpicsQueryKey = ['my-epics'] as const

export function useMyEpics(enabled: boolean) {
  return useQuery({
    queryKey: myEpicsQueryKey,
    queryFn: () => getMyEpics(),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  })
}
