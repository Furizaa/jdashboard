import { useEffect } from 'react'
import { useMutation, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { getIssue, searchIssues, getTransitions } from '~/server/jira'
import type {
  GetIssueResult,
  GetTransitionsResult,
  SearchIssuesResult,
  TransitionIssueResult,
} from '~/server/jira'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'
import { getMrStatuses } from '~/server/gitlab'
import type { GetMrStatusesResult, MrSummary } from '~/server/gitlab'
import { usePolling } from '~/lib/use-polling'
import { useDashboardService } from './context'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from './tanstack-cache'
import type { CreateIssueResultWithTimeout } from './service'

const MR_POLL_INTERVAL_MS = 60_000

export function useBoardData(): UseQueryResult<SearchIssuesResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.board,
    queryFn: () => searchIssues(),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.board,
  })
}

export function useTicket(key: string | null): UseQueryResult<GetIssueResult> {
  return useQuery({
    queryKey: key ? DASHBOARD_QUERY_KEYS.issue(key) : DASHBOARD_QUERY_KEYS.issue('__none__'),
    queryFn: () => getIssue({ data: { key: key as string } }),
    enabled: key !== null,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.issue,
  })
}

export function useTransitions(
  key: string,
  enabled: boolean,
): UseQueryResult<GetTransitionsResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.transitions(key),
    queryFn: () => getTransitions({ data: { key } }),
    enabled,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.transitions,
  })
}

export function useMrStatuses(): UseQueryResult<GetMrStatusesResult> {
  const service = useDashboardService()
  const board = useBoardData()
  const jiraReady = board.data !== undefined
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.mrStatuses,
    queryFn: () => getMrStatuses(),
    enabled: jiraReady,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.mrStatuses,
  })
  useEffect(() => {
    if (query.data && query.data.ok === false && query.data.reason === 'unauthorized') {
      service.notifyUnauthorizedOnce('gitlab')
    }
  }, [query.data, service])
  usePolling(() => {
    if (jiraReady) query.refetch()
  }, MR_POLL_INTERVAL_MS)
  return query
}

export type MrStatusResult =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; summary: MrSummary | null }

type SelectedSlice = { available: false } | { available: true; summary: MrSummary | null }

export function useMrFor(jiraKey: string): MrStatusResult {
  const board = useBoardData()
  const jiraReady = board.data !== undefined
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.mrStatuses,
    queryFn: () => getMrStatuses(),
    enabled: jiraReady,
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.mrStatuses,
    select: (data): SelectedSlice => {
      if (data.ok !== true) return { available: false }
      return { available: true, summary: data.byKey[jiraKey] ?? null }
    },
  })

  if (!jiraReady) return { state: 'idle' }
  if (query.isError) return { state: 'unavailable' }
  if (query.data === undefined) return { state: 'loading' }
  if (!query.data.available) return { state: 'unavailable' }
  return { state: 'ready', summary: query.data.summary }
}

export type TransitionVars = { key: string; transitionId: string; toStatusName: string }

export function useTransitionAction(): {
  mutate: (vars: TransitionVars) => void
  isPending: boolean
} {
  const service = useDashboardService()
  const mutation = useMutation<TransitionIssueResult, Error, TransitionVars>({
    mutationFn: (vars) => service.applyTransition(vars),
  })
  return { mutate: mutation.mutate, isPending: mutation.isPending }
}

export function useCreateAction(opts: { closeModal: () => void; resetForm: () => void }): {
  mutate: (form: QuickCreateInput) => void
  mutateAsync: (form: QuickCreateInput) => Promise<CreateIssueResultWithTimeout>
  isPending: boolean
} {
  const service = useDashboardService()
  const mutation = useMutation<CreateIssueResultWithTimeout, Error, QuickCreateInput>({
    mutationFn: (form) => service.createIssue(form),
    onSuccess: (result) => {
      if (result.ok) {
        opts.resetForm()
        opts.closeModal()
      }
    },
  })
  return {
    mutate: mutation.mutate,
    mutateAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  }
}

export function useMrMergedAction(): (input: {
  key: string
  targetStatusName: string
}) => Promise<void> {
  const service = useDashboardService()
  return async (input) => {
    await service.handleMrMerged(input)
  }
}

export function useRefreshAll(): () => void {
  const service = useDashboardService()
  return () => service.refreshAll()
}
