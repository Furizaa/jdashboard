import { useMemo, useReducer } from 'react'
import type { RefineNoteResult, RouteTranscriptResult } from '~/kernel'
import { useBoardData, useRefineNote, useRouteTranscript, useWatchlistCards } from '~/coordinator'
import { bulkRefineTargets, type RefineTarget } from '../domain'
import {
  deriveBulkRefine,
  initialState,
  isBusy,
  reduce,
  type ApplyItem,
  type BulkRefineDisplay,
  type SelectableMatch,
} from '../view-model'

// How many refines run at once in stage 2. The CLI spawn is async (non-blocking),
// so a handful genuinely overlap; the cap keeps a 10-ticket meeting from starting
// ten Opus processes at once.
const APPLY_CONCURRENCY = 3

export type BulkRefineApi = {
  display: BulkRefineDisplay
  isBusy: boolean
  open: () => void
  close: () => void
  setTranscript: (transcript: string) => void
  route: () => void
  toggle: (key: string) => void
  apply: () => void
}

// Injected so the orchestration (stage 1 routing + stage 2 fan-out) is testable
// without React Query or a real agent.
export type BulkRefineDeps = {
  targets: readonly RefineTarget[]
  route: (transcript: string, tickets: readonly RefineTarget[]) => Promise<RouteTranscriptResult>
  refine: (key: string, refineText: string) => Promise<RefineNoteResult>
}

export function useBulkRefineWithDeps(deps: BulkRefineDeps): BulkRefineApi {
  const [state, dispatch] = useReducer(reduce, initialState)

  const startRoute = (transcript: string) => {
    if (transcript.trim() === '') return
    dispatch({ type: 'routeStarted' })
    const summaryByKey = new Map(deps.targets.map((t) => [t.key, t.summary]))
    deps
      .route(transcript, deps.targets)
      .then((result) => {
        if (result.ok) {
          dispatch({
            type: 'routed',
            matches: result.matches.map((m) => ({
              key: m.key,
              summary: summaryByKey.get(m.key) ?? m.key,
              brief: m.brief,
            })),
          })
        } else {
          dispatch({ type: 'routeFailed', message: result.error.message })
        }
      })
      .catch((error: unknown) => {
        dispatch({
          type: 'routeFailed',
          message: error instanceof Error ? error.message : 'routing failed',
        })
      })
  }

  // Stage 2: a bounded pool of per-ticket refines. Each ticket reports start and
  // finish so the modal shows live per-ticket progress; a failed refine marks
  // just that ticket and never stops the others.
  const runApply = async (selected: readonly SelectableMatch[]) => {
    const queue = [...selected]
    const worker = async () => {
      for (;;) {
        const next = queue.shift()
        if (next === undefined) return
        dispatch({ type: 'ticketStarted', key: next.key })
        try {
          // Sequential within one worker by design — concurrency comes from
          // running `APPLY_CONCURRENCY` of these workers over the shared queue.
          // oxlint-disable-next-line no-await-in-loop -- see comment above
          const result = await deps.refine(next.key, next.brief)
          dispatch({
            type: 'ticketFinished',
            key: next.key,
            ok: result.ok,
            message: result.ok ? undefined : result.error.message,
          })
        } catch (error: unknown) {
          dispatch({
            type: 'ticketFinished',
            key: next.key,
            ok: false,
            message: error instanceof Error ? error.message : 'refine failed',
          })
        }
      }
    }
    const workers = Array.from({ length: Math.min(APPLY_CONCURRENCY, selected.length) }, worker)
    await Promise.all(workers)
    dispatch({ type: 'applyFinished' })
  }

  return {
    display: deriveBulkRefine(state),
    isBusy: isBusy(state),
    open: () => dispatch({ type: 'opened' }),
    close: () => dispatch({ type: 'closed' }),
    setTranscript: (transcript) => dispatch({ type: 'setTranscript', transcript }),
    route: () => {
      if (state.phase === 'input' || state.phase === 'route-error') startRoute(state.transcript)
    },
    toggle: (key) => dispatch({ type: 'toggled', key }),
    apply: () => {
      if (state.phase !== 'preview') return
      const selected = state.matches.filter((m) => m.selected)
      if (selected.length === 0) return
      const items: ApplyItem[] = selected.map((m) => ({
        key: m.key,
        summary: m.summary,
        status: 'pending',
      }))
      dispatch({ type: 'applyStarted', items })
      void runApply(selected)
    },
  }
}

export function useBulkRefine(): BulkRefineApi {
  const board = useBoardData()
  const watchlist = useWatchlistCards()
  const boardIssues = board.data && board.data.ok === true ? board.data.issues : undefined
  const watchlistCards =
    watchlist.data && watchlist.data.ok === true ? watchlist.data.cards : undefined
  const targets = useMemo(
    () => bulkRefineTargets(boardIssues, watchlistCards),
    [boardIssues, watchlistCards],
  )
  const { route } = useRouteTranscript()
  const { refine } = useRefineNote()
  return useBulkRefineWithDeps({ targets, route, refine })
}
