import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useExplainRuns } from '~/coordinator'
import type { ExplainRunEvent } from '~/kernel'
import {
  closeCostsARun,
  deriveExplain,
  hasTab,
  initialState,
  neighbourAfterClose,
  reduce,
  streamingRun,
  type ExplainDisplay,
} from '../view-model'
import { useExplainActions, useExplainStream } from './use-explain-runs'

// Explain's composition root: the server's tab snapshot, the URL's selection,
// the SSE stream for whichever run is live, and the two mutations — all folded
// into the one view-model. The only React in this context lives here and in the
// views (ADR-0003).

export type ExplainApi = {
  readonly display: ExplainDisplay
  readonly select: (iid: number) => void
  /** Start, or re-run. One call: a start for an MR that has a tab supersedes it. */
  readonly run: (iid: number, issueKey?: string) => void
  readonly requestClose: (iid: number) => void
  readonly dismissClose: () => void
  readonly confirmClose: (iid: number) => void
  readonly isStarting: boolean
}

export type ExplainDeps = {
  /** The MR the URL names. `null` is the surface with nothing selected. */
  readonly selected: number | null
  /** Push a selection into the URL — `?mr=` is the tab, per ADR-0007's rule. */
  readonly navigate: (iid: number | null) => void
}

/**
 * The Detail / palette hand-off: the URL names an MR with no tab, so the surface
 * starts the review on arrival (ADR-0009 §3). Detail navigates to
 * `/explain?mr=<iid>` and never imports this context.
 *
 * The latch is scoped to *this* selection rather than to the iid: a re-render
 * must not start twice, and closing the selected tab must not restart it — the
 * tab leaves the open set a commit before the URL stops naming it. Arriving at
 * the same MR again later is a new selection, and does start a new run.
 *
 * Gated on `loaded`, so it cannot race the open set it is checking against.
 */
function useStartOnArrival({
  selected,
  loaded,
  known,
  run,
}: {
  selected: number | null
  loaded: boolean
  known: boolean
  run: (iid: number) => void
}): void {
  const selectionRef = useRef<number | null>(null)
  const startedRef = useRef(false)
  const latestRun = useRef(run)
  latestRun.current = run

  useEffect(() => {
    if (selectionRef.current !== selected) {
      selectionRef.current = selected
      startedRef.current = false
    }
    if (selected === null || !loaded || known || startedRef.current) return
    startedRef.current = true
    latestRun.current(selected)
  }, [selected, loaded, known])
}

export function useExplain({ selected, navigate }: ExplainDeps): ExplainApi {
  const [state, dispatch] = useReducer(reduce, initialState)
  const query = useExplainRuns()
  const { start, close, isStarting } = useExplainActions()

  // Fed in rather than read from inside the reducer, so the view-model never
  // sees TanStack Query.
  const tabs = query.data?.tabs
  useEffect(() => {
    if (tabs !== undefined) dispatch({ type: 'tabsLoaded', tabs })
  }, [tabs])

  useEffect(() => {
    dispatch({ type: 'selected', iid: selected })
  }, [selected])

  const onStreamEvent = useCallback((iid: number, runId: string, event: ExplainRunEvent) => {
    dispatch({ type: 'streamEvent', iid, runId, event })
  }, [])
  const onStreamLost = useCallback((iid: number, runId: string) => {
    dispatch({ type: 'streamLost', iid, runId })
  }, [])
  useExplainStream(streamingRun(state), { onEvent: onStreamEvent, onLost: onStreamLost })

  const run = useCallback(
    (iid: number, issueKey?: string) => {
      // Announced before the call, so the pane says so while it is in flight.
      dispatch({ type: 'runRequested', iid })
      start(iid, issueKey)
        .then((result) => {
          if (result.ok) dispatch({ type: 'runStarted', tab: result.tab })
          else dispatch({ type: 'startFailed', iid, message: result.error.message })
        })
        .catch((error: unknown) => {
          dispatch({
            type: 'startFailed',
            iid,
            message: error instanceof Error ? error.message : 'could not start the review',
          })
        })
    },
    [start],
  )

  useStartOnArrival({
    selected,
    loaded: state.loaded,
    known: selected !== null && hasTab(state, selected),
    run,
  })

  const confirmClose = useCallback(
    (iid: number) => {
      // Optimistic: the tab goes the moment the user confirms, and the server
      // call tears down the report and the worktree behind it. A failure leaves
      // a file the next list read puts the tab back from — the right way round,
      // since a tab that will not close is worse than one that returns.
      const next = neighbourAfterClose(state, iid)
      dispatch({ type: 'closed', iid })
      if (state.selected === iid) navigate(next)
      void close(iid)
    },
    [close, navigate, state],
  )

  // The confirmation guards a close that costs another multi-minute run — a
  // finished report or a run in flight (ADR-0009 §9). A failed or interrupted
  // tab has nothing behind it, so it closes outright rather than asking about
  // nothing.
  const requestClose = useCallback(
    (iid: number) => {
      const tab = state.tabs.find((candidate) => candidate.iid === iid)
      if (tab !== undefined && !closeCostsARun(tab, state.live[iid])) confirmClose(iid)
      else dispatch({ type: 'closeRequested', iid })
    },
    [confirmClose, state],
  )

  return {
    display: deriveExplain(state),
    select: navigate,
    run,
    requestClose,
    dismissClose: useCallback(() => dispatch({ type: 'closeDismissed' }), []),
    confirmClose,
    isStarting,
  }
}
