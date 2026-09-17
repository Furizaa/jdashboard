import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from '~/coordinator/adapters/tanstack-cache'
import type {
  GetWatchlistLanesResult,
  SetWatchlistLanesResult,
  WatchlistLaneConfig,
} from '~/kernel'
import { getWatchlistLanes, setWatchlistLanesFn } from '~/server/server-functions/watchlist-lanes'

// The Watchlist Board's lane configuration: an ordered list of tag ids. Local
// disk state (like tags/watchlist/notes), so there is no gating on the Jira load
// and the read never surfaces an error envelope.
const LANES_QUERY = {
  queryKey: DASHBOARD_QUERY_KEYS.watchlistLanes,
  queryFn: () => getWatchlistLanes(),
  retry: false,
  staleTime: DASHBOARD_STALE_TIMES.watchlistLanes,
} as const

export function useWatchlistLanes(): UseQueryResult<GetWatchlistLanesResult> {
  return useQuery(LANES_QUERY)
}

// Replaces the whole ordered lane list. Local file I/O is fast and atomic, so —
// like the tag and watchlist mutations — the mutation invalidates the single
// shared query rather than optimistically patching.
export function useSetWatchlistLanes(): {
  setLanes: (lanes: readonly WatchlistLaneConfig[]) => Promise<SetWatchlistLanesResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<SetWatchlistLanesResult, Error, readonly WatchlistLaneConfig[]>({
    mutationFn: (lanes) => setWatchlistLanesFn({ data: { lanes: [...lanes] } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.watchlistLanes })
    },
  })
  return { setLanes: mutation.mutateAsync, isPending: mutation.isPending }
}
