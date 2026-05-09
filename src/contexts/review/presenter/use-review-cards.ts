import { useEffect } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from '~/coordinator/adapters/tanstack-cache'
import { useBoardData } from '~/coordinator/hooks'
import { useCoordinator } from '~/coordinator/provider'
import type { GetReviewCardsResult } from '~/kernel'
import { usePolling } from '~/lib/use-polling'
import { getReviewCards } from '~/server/server-functions/review'

const REVIEW_POLL_INTERVAL_MS = 60_000
const GITLAB_QUERY_RETRY = 2
const GITLAB_QUERY_RETRY_DELAY_MS = (attempt: number) => Math.min(1000 * 2 ** attempt, 5000)

export function useReviewCards(): UseQueryResult<GetReviewCardsResult> {
  const coord = useCoordinator()
  const board = useBoardData()
  const jiraReady = board.data !== undefined
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.reviewCards,
    queryFn: () => getReviewCards(),
    enabled: jiraReady,
    retry: GITLAB_QUERY_RETRY,
    retryDelay: GITLAB_QUERY_RETRY_DELAY_MS,
    refetchOnWindowFocus: true,
    staleTime: DASHBOARD_STALE_TIMES.reviewCards,
  })
  useEffect(() => {
    if (
      query.data &&
      query.data.ok === false &&
      // oxlint-disable-next-line no-underscore-dangle -- `_tag` is the standard discriminator on Effect Schema tagged errors
      query.data.error._tag === 'Unauthorized'
    ) {
      coord.notifyUnauthorizedOnce('gitlab')
    }
  }, [query.data, coord])
  usePolling(() => {
    if (jiraReady) query.refetch()
  }, REVIEW_POLL_INTERVAL_MS)
  return query
}
