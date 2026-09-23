import { useMemo, useReducer } from 'react'
import {
  resolveRefineAnswers,
  type RefineAnswer,
  type RefineClarification,
  type RefineNoteResult,
  type RouteTranscriptResult,
} from '~/kernel'
import { useBoardData, useRefineNote, useRouteTranscript, useWatchlistCards } from '~/coordinator'
import { bulkRefineTargets, type RefineTarget } from '../domain'
import {
  deriveBulkRefine,
  initialState,
  isBusy,
  reduce,
  type ApplyItem,
  type BulkRefineDisplay,
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
  setAnswers: (key: string, answers: readonly RefineAnswer[]) => void
  submitAnswers: () => void
}

// Injected so the orchestration (stage 1 routing + stage 2 fan-out) is testable
// without React Query or a real agent.
export type BulkRefineDeps = {
  targets: readonly RefineTarget[]
  route: (transcript: string, tickets: readonly RefineTarget[]) => Promise<RouteTranscriptResult>
  refine: (
    key: string,
    refineText: string,
    priorAnswers?: readonly RefineClarification[],
    round?: number,
  ) => Promise<RefineNoteResult>
}

// One ticket fed to a stage-2 pass: its routed brief (re-sent every pass) plus any
// clarifications settled in earlier rounds.
type PassTicket = {
  key: string
  summary: string
  brief: string
  priorAnswers: readonly RefineClarification[]
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

  // A bounded pool of per-ticket refines, shared by the gathering pass (round 1,
  // no prior answers) and each applying pass (answers folded in). Each ticket
  // reports start and outcome — a note, a question, or a failure — so the modal
  // shows live progress; a failed refine marks just that ticket and never stops
  // the others. `passSettled` at the end routes to the review or the summary.
  const runPass = async (tickets: readonly PassTicket[], round: number) => {
    const queue = [...tickets]
    const worker = async () => {
      for (;;) {
        const next = queue.shift()
        if (next === undefined) return
        dispatch({ type: 'ticketStarted', key: next.key })
        try {
          // Sequential within one worker by design — concurrency comes from
          // running `APPLY_CONCURRENCY` of these over the shared queue.
          // oxlint-disable-next-line no-await-in-loop -- see comment above
          const result = await deps.refine(next.key, next.brief, next.priorAnswers, round)
          if (!result.ok) {
            dispatch({ type: 'ticketFailed', key: next.key, message: result.error.message })
          } else if (result.kind === 'questions') {
            dispatch({
              type: 'ticketAsked',
              key: next.key,
              summary: next.summary,
              brief: next.brief,
              questions: result.questions,
            })
          } else {
            dispatch({ type: 'ticketNoted', key: next.key })
          }
        } catch (error: unknown) {
          dispatch({
            type: 'ticketFailed',
            key: next.key,
            message: error instanceof Error ? error.message : 'refine failed',
          })
        }
      }
    }
    const workers = Array.from({ length: Math.min(APPLY_CONCURRENCY, tickets.length) }, worker)
    await Promise.all(workers)
    dispatch({ type: 'passSettled' })
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
      dispatch({ type: 'gatherStarted', items })
      void runPass(
        selected.map((m) => ({ key: m.key, summary: m.summary, brief: m.brief, priorAnswers: [] })),
        1,
      )
    },
    setAnswers: (key, answers) => dispatch({ type: 'answersChanged', key, answers }),
    submitAnswers: () => {
      if (state.phase !== 'questions') return
      const awaiting = state.items
        .filter((i) => i.status === 'awaiting')
        .map((i) => state.grills[i.key])
        .filter((g): g is NonNullable<typeof g> => g !== undefined)
      if (awaiting.length === 0) return
      const resolved: Record<string, readonly RefineClarification[]> = {}
      const tickets: PassTicket[] = awaiting.map((grill) => {
        const clarifications = resolveRefineAnswers(grill.questions, grill.answers)
        resolved[grill.key] = clarifications
        return {
          key: grill.key,
          summary: grill.summary,
          brief: grill.brief,
          priorAnswers: [...grill.priorAnswers, ...clarifications],
        }
      })
      dispatch({ type: 'applyStarted', resolved })
      void runPass(tickets, state.round + 1)
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
