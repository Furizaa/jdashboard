import { useQuery } from '@tanstack/react-query'
import { getMyEpics } from '~/server/server-functions/capture'

const myEpicsQueryKey = ['my-epics'] as const

export function useMyEpics(enabled: boolean) {
  return useQuery({
    queryKey: myEpicsQueryKey,
    queryFn: () => getMyEpics(),
    staleTime: 5 * 60_000,
    retry: false,
    enabled,
  })
}
