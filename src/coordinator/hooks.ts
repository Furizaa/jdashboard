import { useEffect, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Result } from 'neverthrow'
import {
  getMrStatuses,
  searchIssues,
  type GetMrStatusesResult,
  type SearchIssuesResult,
} from '~/server/server-functions/board'
import {
  getIssue,
  getTransitions,
  listWorkspaces,
  type GetIssueResult,
  type GetTransitionsResult,
} from '~/server/server-functions/detail'
import {
  getNote,
  listNotesKeys,
  saveNote,
  type GetNoteResult,
  type NoteMutationResult,
} from '~/server/server-functions/notes'
import {
  getChangelog,
  refineNote,
  type GetChangelogResult,
  type RefineNoteResult,
} from '~/server/server-functions/refine'
import { askTicket, type AskTicketResult } from '~/server/server-functions/ask'
import {
  closeExplain,
  getExplainDiffs,
  listExplainRuns,
  startExplain,
  type CloseExplainResult,
  type GetExplainDiffsResult,
  type ListExplainRunsResult,
  type StartExplainResult,
} from '~/server/server-functions/explain'
import { routeTranscript, type RouteTranscriptResult } from '~/server/server-functions/bulk-refine'
import type { RefineClarification } from '~/server/lib/refine-grilling'
import type { QuickCreateInput } from '~/server/contexts/capture/application/quick-create-schema'
import type { MrSummary } from '~/server/gateways/gitlab/types'
import { usePolling } from '~/lib/use-polling'
import { createBrowserWindowAdapter } from './adapters/browser-window'
import { createSonnerToastAdapter } from './adapters/sonner-toast'
import { useCoordinator } from './provider'
import { DASHBOARD_QUERY_KEYS, DASHBOARD_STALE_TIMES } from './adapters/tanstack-cache'
import type { ApplyTransitionError, CreateIssueError, HandleMrMergedError } from './errors'
import type { CreateIssueSnapshot, MrMergedSnapshot } from './coordinator'

const MR_POLL_INTERVAL_MS = 60_000
const GITLAB_QUERY_RETRY = 2
const GITLAB_QUERY_RETRY_DELAY_MS = (attempt: number) => Math.min(1000 * 2 ** attempt, 5000)

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
  const coord = useCoordinator()
  const board = useBoardData()
  const jiraReady = board.data !== undefined
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.mrStatuses,
    queryFn: () => getMrStatuses(),
    enabled: jiraReady,
    retry: GITLAB_QUERY_RETRY,
    retryDelay: GITLAB_QUERY_RETRY_DELAY_MS,
    refetchOnWindowFocus: true,
    staleTime: DASHBOARD_STALE_TIMES.mrStatuses,
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
    retry: GITLAB_QUERY_RETRY,
    retryDelay: GITLAB_QUERY_RETRY_DELAY_MS,
    refetchOnWindowFocus: true,
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

// Polled so that renaming a workspace outside the app (adding/removing a ticket
// ref) reflects on the board within a few seconds, no reload.
const WORKSPACES_POLL_INTERVAL_MS = 5_000
const EMPTY_KEYS: readonly string[] = []

// One shared query feeds every card, the detail panel, and the board filter
// (react-query dedupes by key; `select` narrows per consumer).
const WORKSPACES_QUERY = {
  queryKey: DASHBOARD_QUERY_KEYS.workspaces,
  queryFn: () => listWorkspaces(),
  retry: false,
  staleTime: DASHBOARD_STALE_TIMES.workspaces,
  refetchInterval: WORKSPACES_POLL_INTERVAL_MS,
  refetchOnWindowFocus: true,
} as const

// Whether a cmux workspace is open for this ticket. The heuristic is the
// ticket key appearing in a workspace name (see `listOpenIssueKeys`). Loading
// reads as "not open" so the "Open in Workspace" affordance is the default.
export function useWorkspaceOpen(issueKey: string): boolean {
  const query = useQuery({
    ...WORKSPACES_QUERY,
    select: (data) => data.openIssueKeys.includes(issueKey),
  })
  return query.data ?? false
}

// The full set of ticket keys with an open workspace — for the board's
// "Only Workspace" filter.
export function useOpenWorkspaceKeys(): readonly string[] {
  const query = useQuery({ ...WORKSPACES_QUERY, select: (data) => data.openIssueKeys })
  return query.data ?? EMPTY_KEYS
}

export function useInvalidateWorkspaces(): () => void {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.workspaces })
  }
}

export type TransitionVars = { key: string; transitionId: string; toStatusName: string }

export function useTransitionAction(): {
  mutate: (vars: TransitionVars) => void
  isPending: boolean
} {
  const coord = useCoordinator()
  const mutation = useMutation<Result<void, ApplyTransitionError>, Error, TransitionVars>({
    mutationFn: async (vars) => coord.applyTransition(vars),
  })
  return { mutate: mutation.mutate, isPending: mutation.isPending }
}

export function useCreateAction(): {
  mutateAsync: (form: QuickCreateInput) => Promise<Result<CreateIssueSnapshot, CreateIssueError>>
} {
  const coord = useCoordinator()
  const mutation = useMutation<
    Result<CreateIssueSnapshot, CreateIssueError>,
    Error,
    QuickCreateInput
  >({
    mutationFn: async (form) => coord.createIssue(form),
  })
  return { mutateAsync: mutation.mutateAsync }
}

export function useMrMergedAction(): (input: {
  key: string
  targetStatusName: string
}) => Promise<Result<MrMergedSnapshot, HandleMrMergedError>> {
  const coord = useCoordinator()
  return async (input) => coord.handleMrMerged(input)
}

export function useRefreshAll(): () => void {
  const coord = useCoordinator()
  return () => coord.refreshAll()
}

// One private markdown note per ticket, keyed by issue key. Notes are purely
// local disk state (like tags/watchlist), so there is no gating on the Jira load
// and the read never surfaces an error envelope.
export function useNote(key: string): UseQueryResult<GetNoteResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.note(key),
    queryFn: () => getNote({ data: { key } }),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.note,
  })
}

// Save invalidates the one ticket's note query plus the has-note set (so a card's
// note badge appears/disappears as a note is first written or blanked). There is
// no optimistic patch/rollback (local file I/O is fast and never partially
// applies), mirroring how the tag and watchlist mutations invalidate rather than
// patch.
export function useSaveNote(): {
  save: (key: string, content: string) => Promise<NoteMutationResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<NoteMutationResult, Error, { key: string; content: string }>({
    mutationFn: (data) => saveNote({ data }),
    onSuccess: (_result, { key }) => {
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.note(key) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.noteKeys })
    },
  })
  return {
    save: (key, content) => mutation.mutateAsync({ key, content }),
    isPending: mutation.isPending,
  }
}

// The automated changelog beside a ticket's note — one entry per Refine run.
// Read-only local disk state, like the note itself.
export function useChangelog(key: string): UseQueryResult<GetChangelogResult> {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.changelog(key),
    queryFn: () => getChangelog({ data: { key } }),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.changelog,
  })
}

// Refine rewrites the note with a headless agent, then records what changed in
// the changelog. On success invalidate the note (rewritten), the changelog (new
// entry), and the has-note set (a first refine can create the note), so all three
// refetch — mirroring `useSaveNote`, with no optimistic patch.
export function useRefineNote(): {
  refine: (
    key: string,
    refineText: string,
    priorAnswers?: readonly RefineClarification[],
    round?: number,
  ) => Promise<RefineNoteResult>
  isPending: boolean
} {
  const queryClient = useQueryClient()
  const mutation = useMutation<
    RefineNoteResult,
    Error,
    {
      key: string
      refineText: string
      priorAnswers?: readonly RefineClarification[]
      round?: number
    }
  >({
    mutationFn: (data) => refineNote({ data }),
    onSuccess: (result, { key }) => {
      // Only a completed note touches disk; a questions reply writes nothing, so
      // there is nothing to invalidate until the agent finally returns the note.
      if (!result.ok || result.kind !== 'note') return
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.note(key) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.changelog(key) })
      queryClient.invalidateQueries({ queryKey: DASHBOARD_QUERY_KEYS.noteKeys })
    },
  })
  return {
    refine: (key, refineText, priorAnswers, round) =>
      mutation.mutateAsync({ key, refineText, priorAnswers, round }),
    isPending: mutation.isPending,
  }
}

// Ask answers a question about a ticket with a headless read-only agent. Unlike
// Refine it writes nothing — the answer is returned for display only — so there is no
// `onSuccess` cache work. Same grilling loop shape (`priorAnswers` + `round`).
export function useAskTicket(): {
  ask: (
    key: string,
    question: string,
    priorAnswers?: readonly RefineClarification[],
    round?: number,
  ) => Promise<AskTicketResult>
  isPending: boolean
} {
  const mutation = useMutation<
    AskTicketResult,
    Error,
    {
      key: string
      question: string
      priorAnswers?: readonly RefineClarification[]
      round?: number
    }
  >({
    mutationFn: (data) => askTicket({ data }),
  })
  return {
    ask: (key, question, priorAnswers, round) =>
      mutation.mutateAsync({ key, question, priorAnswers, round }),
    isPending: mutation.isPending,
  }
}

// Bulk Refine, stage 1: route a pasted meeting transcript to the board tickets it
// discusses, returning a per-ticket brief for each. This is a pure read (it
// writes nothing — stage 2's per-ticket `refineNote` does the writes and its own
// invalidation), so there is no `onSuccess` cache work here.
// Structurally the server `RouteTicket` (declared locally to avoid an extra
// import edge from this already-dependency-dense module).
type BulkRefineTicket = {
  key: string
  summary: string
  epic: string | null
  labels: readonly string[]
}

export function useRouteTranscript(): {
  route: (
    transcript: string,
    tickets: readonly BulkRefineTicket[],
  ) => Promise<RouteTranscriptResult>
  isPending: boolean
} {
  const mutation = useMutation<
    RouteTranscriptResult,
    Error,
    { transcript: string; tickets: readonly BulkRefineTicket[] }
  >({
    mutationFn: (data) => routeTranscript({ data }),
  })
  return {
    route: (transcript, tickets) => mutation.mutateAsync({ transcript, tickets }),
    isPending: mutation.isPending,
  }
}

// Whether a ticket has a note. One shared query lists the keys with a note file;
// each card selects its own membership (react-query dedupes by key), so the board
// costs one request, not one per card — the watchlist/workspace-badge pattern.
export function useHasNote(issueKey: string): boolean {
  const query = useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.noteKeys,
    queryFn: () => listNotesKeys(),
    retry: false,
    staleTime: DASHBOARD_STALE_TIMES.noteKeys,
    select: (data) => (issueKey === '' ? false : data.keys.includes(issueKey)),
  })
  return query.data ?? false
}

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

// Opening a URL and copying text with a toast were inlined in `use-issue-panel`
// (`window.open` + `navigator.clipboard` + two `toast` calls). The palette needs
// the same two behaviours for its `o` / `c` / `y` actions, and a second copy
// would be a second failure message to keep in sync — so they live here, behind
// the coordinator's existing Browser and Toast ports.
export type BrowserActions = {
  openInNewTab: (url: string) => void
  /** `label` names what was copied, e.g. "Link" → "Link copied". */
  copyWithToast: (text: string, label: string) => void
}

export function useBrowserActions(): BrowserActions {
  return useMemo(() => {
    const browser = createBrowserWindowAdapter()
    const toast = createSonnerToastAdapter()
    return {
      openInNewTab: browser.openInNewTab,
      copyWithToast: (text, label) => {
        browser.copyToClipboard(text).then(
          () => toast.success(`${label} copied`),
          () => toast.error(`Couldn't copy ${label.toLowerCase()} to clipboard`),
        )
      },
    }
  }, [])
}
