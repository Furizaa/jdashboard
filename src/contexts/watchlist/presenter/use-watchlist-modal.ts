import { useCallback, useEffect, useReducer, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { SearchWatchlistCandidatesResult, WatchlistCandidate } from '~/kernel'
import { addToWatchlist, searchWatchlistCandidates } from '~/server/server-functions/watchlist'
import {
  errorMessage as selectErrorMessage,
  initialState,
  isAdding as selectIsAdding,
  isOpen as selectIsOpen,
  reduce,
} from '../view-model'
import { useInvalidateWatchlist } from './use-watchlist-mutations'

const SEARCH_DEBOUNCE_MS = 250
const MIN_QUERY_LENGTH = 2

export type WatchlistResultsView =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'empty' }
  | { kind: 'ready'; candidates: readonly WatchlistCandidate[] }

export type WatchlistModalApi = {
  open: boolean
  isAdding: boolean
  error: string | null
  searchText: string
  results: WatchlistResultsView
  setOpen: (next: boolean) => void
  openModal: () => void
  closeModal: () => void
  setSearchText: (text: string) => void
  add: (key: string) => void
  retry: () => void
}

function deriveResults(
  open: boolean,
  debounced: string,
  query: UseQueryResult<SearchWatchlistCandidatesResult>,
): WatchlistResultsView {
  if (!open || debounced.length < MIN_QUERY_LENGTH) return { kind: 'idle' }
  if (query.isLoading) return { kind: 'loading' }
  if (query.isError || query.data?.ok === false) return { kind: 'error' }
  const candidates = query.data?.ok === true ? query.data.candidates : []
  if (candidates.length === 0) return { kind: 'empty' }
  return { kind: 'ready', candidates }
}

export function useWatchlistModal(): WatchlistModalApi {
  const [state, dispatch] = useReducer(reduce, initialState)
  const [searchText, setSearchText] = useState('')
  const [debounced, setDebounced] = useState('')
  const invalidate = useInvalidateWatchlist()

  useEffect(() => {
    const id = setTimeout(() => setDebounced(searchText.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [searchText])

  const open = selectIsOpen(state)
  const query = useQuery({
    queryKey: ['watchlist-search', debounced],
    queryFn: () => searchWatchlistCandidates({ data: { text: debounced } }),
    enabled: open && debounced.length >= MIN_QUERY_LENGTH,
    retry: false,
    staleTime: 30_000,
  })

  const add = useCallback(
    (key: string) => {
      dispatch({ type: 'addStarted' })
      void (async () => {
        try {
          const res = await addToWatchlist({ data: { key } })
          if (res.ok) {
            dispatch({ type: 'addResolved' })
            setSearchText('')
            setDebounced('')
            invalidate()
          } else {
            dispatch({ type: 'addRejected', message: res.error.message })
          }
        } catch (e) {
          dispatch({
            type: 'addRejected',
            message: e instanceof Error ? e.message : 'unknown error',
          })
        }
      })()
    },
    [invalidate],
  )

  const setOpen = useCallback((next: boolean) => {
    dispatch({ type: next ? 'opened' : 'closed' })
  }, [])

  return {
    open,
    isAdding: selectIsAdding(state),
    error: selectErrorMessage(state),
    searchText,
    results: deriveResults(open, debounced, query),
    setOpen,
    openModal: useCallback(() => dispatch({ type: 'opened' }), []),
    closeModal: useCallback(() => dispatch({ type: 'closed' }), []),
    setSearchText,
    add,
    retry: () => query.refetch(),
  }
}
