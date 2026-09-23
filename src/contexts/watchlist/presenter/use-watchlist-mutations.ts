import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DASHBOARD_QUERY_KEYS } from '~/coordinator/adapters/tanstack-cache'
import type { WatchlistMutationResult } from '~/kernel'
import { addToWatchlist, removeFromWatchlist } from '~/server/server-functions/watchlist'

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

// The counterpart to `useRemoveFromWatchlist`, for callers that already know
// which ticket they mean. `WatchlistModal` does not use it — the modal's job is
// to *find* a ticket, and it adds inline once it has one — but the command
// palette has already found one, so it wants the bare mutation.
export function useAddToWatchlist(): {
  add: (key: string) => Promise<WatchlistMutationResult>
  isPending: boolean
} {
  const invalidate = useInvalidateWatchlist()
  const mutation = useMutation<WatchlistMutationResult, Error, string>({
    mutationFn: (key) => addToWatchlist({ data: { key } }),
    onSuccess: () => invalidate(),
  })
  return { add: mutation.mutateAsync, isPending: mutation.isPending }
}
