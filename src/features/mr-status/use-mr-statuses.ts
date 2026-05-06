import { useQuery } from '@tanstack/react-query'
import { getMrStatuses } from '~/server/gitlab'
import type { MrSummary } from '~/server/gitlab'
import { useBoardIssues } from '~/features/board/use-board-issues'
import { usePolling } from '~/lib/use-polling'

export const mrStatusesQueryKey = ['mr-statuses'] as const

const POLL_INTERVAL_MS = 60_000
const STALE_TIME_MS = 30_000

export function useMrStatuses() {
  const board = useBoardIssues()
  const jiraReady = board.data !== undefined
  const query = useQuery({
    queryKey: mrStatusesQueryKey,
    queryFn: () => getMrStatuses(),
    enabled: jiraReady,
    retry: false,
    staleTime: STALE_TIME_MS,
  })
  usePolling(() => {
    if (jiraReady) query.refetch()
  }, POLL_INTERVAL_MS)
  return query
}

export type MrStatusResult =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'unavailable' }
  | { state: 'ready'; summary: MrSummary | null }

type SelectedSlice =
  | { available: false }
  | { available: true; summary: MrSummary | null }

export function useMrStatus(jiraKey: string): MrStatusResult {
  const board = useBoardIssues()
  const jiraReady = board.data !== undefined
  const query = useQuery({
    queryKey: mrStatusesQueryKey,
    queryFn: () => getMrStatuses(),
    enabled: jiraReady,
    retry: false,
    staleTime: STALE_TIME_MS,
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
