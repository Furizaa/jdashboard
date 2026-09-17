import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from '~/coordinator/adapters/tanstack-cache'
import { useBoardData } from '~/coordinator/hooks'
import type { GetWatchlistCardsResult } from '~/kernel'
import { getWatchlistCards } from '~/server/server-functions/watchlist'

// One shared query feeds the board cards and the detail-panel membership check
// (react-query dedupes by key; `select` narrows per consumer), mirroring the
// workspaces query. Gated on the board's first paint so it does not race the
// initial Jira load.
const WATCHLIST_QUERY = {
  queryKey: DASHBOARD_QUERY_KEYS.watchlist,
  queryFn: () => getWatchlistCards(),
  retry: false,
  staleTime: DASHBOARD_STALE_TIMES.watchlist,
} as const

export function useWatchlistCards(): UseQueryResult<GetWatchlistCardsResult> {
  const board = useBoardData()
  return useQuery({ ...WATCHLIST_QUERY, enabled: board.data !== undefined })
}

// Whether a ticket is on the watchlist — drives the detail panel's remove action.
export function useWatchlistMembership(issueKey: string): boolean {
  const board = useBoardData()
  const query = useQuery({
    ...WATCHLIST_QUERY,
    enabled: board.data !== undefined,
    select: (data) => (data.ok === true ? data.cards.some((c) => c.key === issueKey) : false),
  })
  return query.data ?? false
}
