import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS } from '~/coordinator/adapters/tanstack-cache'
import type { WatchlistMutationResult } from '~/kernel'
import { removeFromWatchlist } from '~/server/server-functions/watchlist'

export function useInvalidateWatchlist(): () => void {
  const queryClient = useQueryClient()
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.watchlist })
  }, [queryClient])
}

export function useRemoveFromWatchlist(): {
  remove: (key: string) => Promise<WatchlistMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateWatchlist()
  const mutation = useMutation<WatchlistMutationResult, Error, string>({
    mutationFn: (key) => removeFromWatchlist({ data: { key } }),
    onSuccess: () => invalidate(),
  })
  return { remove: mutation.mutateAsync, isPending: mutation.isPending }
}
