import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type {
  CloseExplainResult,
  GetExplainDiffsResult,
  ListExplainRunsResult,
  StartExplainResult,
} from '~/kernel'
import {
  closeExplain,
  getExplainDiffs,
  listExplainRuns,
  startExplain,
} from '~/server/server-functions/explain'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from './adapters/tanstack-cache'

// The coordinator's Explain adapters. They live apart from the other hooks for
// the reason every other query there is one call and a cache key, while these
// four carry the whole open-tab lifecycle (`~/.clashboard/explain/` is the source
// of truth, not client state) and the commentary that goes with it.
//
// The wire types come through `~/kernel`, as the kernel rule asks: the values
// below are server functions and must be imported from their module, but their
// result shapes are kernel vocabulary.

// The open Explain tabs: one query for the whole set, which is derived from
// `~/.clashboard/explain/` rather than from client state — so a ten-minute agent
// run survives a reload (ADR-0009 §2). Live progress does **not** come through
// here; it arrives on the SSE channel the Explain presenter subscribes to. This
// query is the open set, each tab's persisted report, and each MR's current head
// for the stale-report warning.
export function useExplainRuns(): UseQueryResult<ListExplainRunsResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.explainTabs,
    queryFn: () => listExplainRuns(),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.explainTabs,
  })
}

// One merge request's whole diff, for a move page's expander (ADR-0010 §6).
//
// `enabled` is the whole point: this is the only query in the app that must not
// run until the user asks for it. A report read with no expander opened — the
// common case — costs no GitLab call at all, and once one move has fetched it
// every other move on the same report reads it from the cache.
export function useExplainDiffs(iid: number | null): UseQueryResult<GetExplainDiffsResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.explainDiffs(iid ?? 0),
    queryFn: () => getExplainDiffs({ data: { iid: iid as number } }),
    enabled: iid !== null,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.explainDiffs,
  })
}

// Starting a run creates the tab, so the open set is invalidated. The returned
// tab is also handed straight to the view-model, which appends it rather than
// waiting for the refetch: a run that takes ten minutes must not start
// invisibly.
export function useStartExplain(): {
  start: (iid: number, issueKey?: string) => Promise<StartExplainResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<StartExplainResult, Error, { iid: number; issueKey?: string }>({
    mutationFn: (data) => startExplain({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.explainTabs })
    },
  })
  return {
    start: (iid, issueKey) => mutation.mutateAsync({ iid, issueKey }),
    isPending: mutation.isPending,
  }
}

// Closing a tab deletes its report, aborts any run in flight, and removes the
// worktree — all three server-side (ADR-0009 §9). Here it is just an invalidation.
export function useCloseExplain(): {
  close: (iid: number) => Promise<CloseExplainResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<CloseExplainResult, Error, { iid: number }>({
    mutationFn: (data) => closeExplain({ data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.explainTabs })
    },
  })
  return { close: (iid) => mutation.mutateAsync({ iid }), isPending: mutation.isPending }
}
