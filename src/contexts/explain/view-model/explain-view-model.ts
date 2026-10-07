import { match, P } from 'ts-pattern'
import type {
  ExplainActivityLine,
  ExplainBlock,
  ExplainMove,
  ExplainPhase,
  ExplainReport,
  ExplainRunEvent,
  ExplainSeverity,
  ExplainTab,
  ExplainVerdict,
} from '~/kernel'
import {
  findingCountOf,
  freshnessWarning,
  layOutReport,
  moveById,
  verdictIn,
  worstSeverityOf,
} from '../domain'

// The Explain surface's state machine: which tabs are open, which one is
// selected, and what each live run is doing.
//
// Framework-free (ADR-0003): the tab set arrives as a plain value from
// `listExplainRuns`, SSE messages arrive as plain events, and `navigate` is the
// presenter's problem. Two inputs can disagree about one tab — the server's
// snapshot and the live stream — and resolving that is the interesting part:
//
//   - The **server snapshot** is the open set, and the only source of
//     `generatedAt`, the persisted report, and the MR's current head.
//   - The **stream** is the present tense, and wins on phase, activity, and the
//     report of the run it belongs to.
//
// A third, much smaller selection rides along: **which move is open** inside the
// selected tab (ADR-0010). It mirrors `?move=` exactly as `selected` mirrors
// `?mr=`, and the one piece of state that is not in the URL is the *memory* of
// the move last read per tab — so switching merge requests and coming back lands
// where the reader left off rather than back on Overview. The memory is only ever
// read to decide what the presenter puts in the URL; the URL stays the one source
// of what is on screen.
//
//      no tabs ─► tab(s), none selected ─► selected
//                                            │
//            preparing ─► running ─► report ─┤
//                 └───────────┴──► failed    │
//                 └───────────┴──► interrupted
//
// `reduce` is exhaustive over the event union, and each arm that depends on
// phase is exhaustive over phase — so a new phase or a new event is a compile
// error until every arm handles it.

/** What the stream has told us about one run, overlaying the server snapshot. */
export type LiveRun = {
  readonly runId: string
  readonly phase: ExplainPhase
  readonly activity: readonly ExplainActivityLine[]
  /** The whole chaptered report, not a block list — the rail needs the moves. */
  readonly report: ExplainReport | null
  readonly error: string | null
}

export type ExplainState = {
  /** The server's snapshot of the open set. Empty until the first load. */
  readonly tabs: readonly ExplainTab[]
  /** Whether that snapshot has arrived yet — "no tabs" and "not loaded" differ. */
  readonly loaded: boolean
  /** The MR the URL names, or `null` for the surface with nothing selected. */
  readonly selected: number | null
  /** The move `?move=` names inside that tab. `null` is the Overview page. */
  readonly selectedMove: string | null
  /**
   * The move last read in each tab. Not the selection — the selection is the
   * URL's — but what the presenter puts *into* the URL when the reader switches
   * tabs, so a half-read report is not restarted from the top each time.
   */
  readonly lastMove: Readonly<Record<number, string>>
  /** Per-MR stream overlay, keyed by iid. */
  readonly live: Readonly<Record<number, LiveRun>>
  /** The MR whose close confirmation is open. */
  readonly closing: number | null
  /**
   * MRs whose `startExplain` call is in flight. A start resolves the MR, its
   * threads and its ticket before a run — and therefore a tab — exists, so
   * without this the surface has nothing to say for a second or two after the
   * hand-off lands, and says "no reviews open": a feature that reads as a bug.
   */
  readonly starting: ReadonlySet<number>
  /** A start that failed before a run existed — there is no stream to carry it. */
  readonly startErrors: Readonly<Record<number, string>>
}

export const initialState: ExplainState = {
  tabs: [],
  loaded: false,
  selected: null,
  selectedMove: null,
  lastMove: {},
  live: {},
  closing: null,
  starting: new Set(),
  startErrors: {},
}

export type ExplainEvent =
  /** The server snapshot landed (first load, a refetch, or after a close). */
  | { readonly type: 'tabsLoaded'; readonly tabs: readonly ExplainTab[] }
  /** The URL changed — `?mr=` is the selection, per ADR-0007's rule. */
  | { readonly type: 'selected'; readonly iid: number | null }
  /**
   * The URL's `?move=`. Dispatched from the URL rather than from the click, like
   * every other selection here, so the back button works inside a report.
   */
  | {
      readonly type: 'moveSelected'
      readonly iid: number | null
      readonly moveId: string | null
    }
  /** A start was asked for. Dispatched before the call, not after it. */
  | { readonly type: 'runRequested'; readonly iid: number }
  /** `startExplain` returned a run; its tab exists before the snapshot refetches. */
  | { readonly type: 'runStarted'; readonly tab: ExplainTab }
  | { readonly type: 'startFailed'; readonly iid: number; readonly message: string }
  /** One SSE message for one MR's run. */
  | {
      readonly type: 'streamEvent'
      readonly iid: number
      readonly runId: string
      readonly event: ExplainRunEvent
    }
  /** The stream died without a terminal message (server gone, network gone). */
  | { readonly type: 'streamLost'; readonly iid: number; readonly runId: string }
  | { readonly type: 'closeRequested'; readonly iid: number }
  | { readonly type: 'closeDismissed' }
  /** The close went through; the tab is gone before the snapshot refetches. */
  | { readonly type: 'closed'; readonly iid: number }

const TERMINAL_PHASES: ReadonlySet<ExplainPhase> = new Set(['report', 'failed', 'interrupted'])

export function isTerminalPhase(phase: ExplainPhase): boolean {
  return TERMINAL_PHASES.has(phase)
}

function liveFromTab(tab: ExplainTab): LiveRun | null {
  if (tab.runId === null) return null
  return {
    runId: tab.runId,
    phase: tab.phase,
    activity: tab.activity,
    report: tab.report,
    error: tab.error,
  }
}

/**
 * Fold one stream message into a run.
 *
 * Activity is **deduplicated by `seq`** because the endpoint replays the log
 * before it subscribes (so a reload sees the whole run), which can repeat the
 * line that arrived between the two. Appending blind would double it.
 */
function applyStreamEvent(live: LiveRun, event: ExplainRunEvent): LiveRun {
  return match(event)
    .with({ kind: 'phase' }, ({ phase }) => ({ ...live, phase }))
    .with({ kind: 'activity' }, ({ line }) =>
      live.activity.some((existing) => existing.seq === line.seq)
        ? live
        : { ...live, activity: [...live.activity, line] },
    )
    .with({ kind: 'report' }, ({ report }) => ({
      ...live,
      phase: 'report' as const,
      report,
      error: null,
    }))
    .with({ kind: 'failed' }, ({ message }) => ({
      ...live,
      phase: 'failed' as const,
      error: message,
    }))
    .exhaustive()
}

/** The same set without one member. Sets are values here, like every other field. */
function without(set: ReadonlySet<number>, iid: number): ReadonlySet<number> {
  if (!set.has(iid)) return set
  const next = new Set(set)
  next.delete(iid)
  return next
}

/**
 * The click, not its answer. A start takes a second or two of GitLab and Jira
 * reads before a run — and therefore a tab — exists, and the surface has to say
 * so: for a hand-off that has just landed on an MR with no tab, and for a
 * re-run, which throws the old report away the moment it begins.
 *
 * It also clears any previous start error, so a retry is not read as the failure
 * it is retrying.
 */
function startRequested(state: ExplainState, iid: number): ExplainState {
  const { [iid]: _retried, ...startErrors } = state.startErrors
  return { ...state, starting: new Set(state.starting).add(iid), startErrors }
}

function withLive(
  state: ExplainState,
  iid: number,
  update: (live: LiveRun) => LiveRun,
  seed: () => LiveRun | null,
): ExplainState {
  const existing = state.live[iid] ?? seed()
  if (existing === null) return state
  return { ...state, live: { ...state.live, [iid]: update(existing) } }
}

export function reduce(state: ExplainState, event: ExplainEvent): ExplainState {
  return (
    match(event)
      .with({ type: 'tabsLoaded' }, ({ tabs }) => {
        // Drop overlays for tabs that are gone, and for runs the server has
        // superseded — a stale overlay would outlive the thing it described.
        const live: Record<number, LiveRun> = {}
        for (const tab of tabs) {
          const existing = state.live[tab.iid]
          if (existing !== undefined && existing.runId === tab.runId) live[tab.iid] = existing
          else {
            const seeded = liveFromTab(tab)
            if (seeded !== null) live[tab.iid] = seeded
          }
        }
        return { ...state, tabs, loaded: true, live }
      })

      .with({ type: 'selected' }, ({ iid }) => ({ ...state, selected: iid }))

      // Remembered per tab as well as applied, so switching away and back
      // returns the reader to the move they were on. An unknown slug is still
      // remembered: the fall-back to Overview is a *derivation*, and a report
      // that has just been re-run may yet come back with that move in it.
      .with({ type: 'moveSelected' }, ({ iid, moveId }) => {
        if (iid === null) return { ...state, selectedMove: moveId }
        if (moveId === null) {
          const { [iid]: _forgotten, ...lastMove } = state.lastMove
          return { ...state, selectedMove: null, lastMove }
        }
        return { ...state, selectedMove: moveId, lastMove: { ...state.lastMove, [iid]: moveId } }
      })

      .with({ type: 'runRequested' }, ({ iid }) => startRequested(state, iid))

      .with({ type: 'runStarted' }, ({ tab }) => {
        const others = state.tabs.filter((existing) => existing.iid !== tab.iid)
        const seeded = liveFromTab(tab)
        const { [tab.iid]: _dropped, ...startErrors } = state.startErrors
        return {
          ...state,
          // Appended rather than refetched-and-waited: the tab must appear the
          // moment the run exists, or a ten-minute run starts invisibly.
          tabs: [...others, tab],
          loaded: true,
          selected: tab.iid,
          live: seeded === null ? state.live : { ...state.live, [tab.iid]: seeded },
          starting: without(state.starting, tab.iid),
          startErrors,
        }
      })

      .with({ type: 'startFailed' }, ({ iid, message }) => ({
        ...state,
        starting: without(state.starting, iid),
        startErrors: { ...state.startErrors, [iid]: message },
      }))

      // A message for a run the tab has since replaced is ignored rather than
      // applied to its successor — the `runId` guard is what makes a re-run safe.
      .with({ type: 'streamEvent' }, ({ iid, runId, event: streamed }) => {
        const existing = state.live[iid]
        if (existing !== undefined && existing.runId !== runId) return state
        return withLive(
          state,
          iid,
          (live) => applyStreamEvent(live, streamed),
          (): LiveRun => ({
            runId,
            phase: 'preparing',
            activity: [],
            report: null,
            error: null,
          }),
        )
      })

      .with({ type: 'streamLost' }, ({ iid, runId }) => {
        const existing = state.live[iid]
        if (existing === undefined || existing.runId !== runId) return state
        // A stream that drops after the run finished tells us nothing new. One
        // that drops mid-run means the run is no longer being watched by anyone,
        // which is exactly "interrupted — re-run".
        if (isTerminalPhase(existing.phase)) return state
        const interrupted: LiveRun = { ...existing, phase: 'interrupted' }
        return { ...state, live: { ...state.live, [iid]: interrupted } }
      })

      .with({ type: 'closeRequested' }, ({ iid }) => ({ ...state, closing: iid }))

      .with({ type: 'closeDismissed' }, () => ({ ...state, closing: null }))

      .with({ type: 'closed' }, ({ iid }) => {
        const { [iid]: _live, ...live } = state.live
        const { [iid]: _error, ...startErrors } = state.startErrors
        const { [iid]: _move, ...lastMove } = state.lastMove
        const tabs = state.tabs.filter((tab) => tab.iid !== iid)
        return {
          ...state,
          tabs,
          live,
          lastMove,
          // The neighbour's own remembered move goes into the URL, so the
          // presenter navigates rather than this deciding — but the *old* tab's
          // move must not linger as the new tab's selection for one frame.
          selectedMove: state.selected === iid ? null : state.selectedMove,
          starting: without(state.starting, iid),
          startErrors,
          closing: null,
          // Closing the selected tab selects its neighbour rather than dropping
          // the reader onto the empty surface with other reviews still open.
          selected: state.selected === iid ? neighbourOf(state.tabs, iid) : state.selected,
        }
      })

      .exhaustive()
  )
}

/** The tab to select after closing `iid`: the next one, else the previous one. */
function neighbourOf(tabs: readonly ExplainTab[], iid: number): number | null {
  const index = tabs.findIndex((tab) => tab.iid === iid)
  if (index === -1) return null
  return tabs[index + 1]?.iid ?? tabs[index - 1]?.iid ?? null
}

/**
 * Where the selection lands after closing `iid`. Exported because the presenter
 * has to put it in the URL, which the view-model cannot do — the answer is still
 * a rule, so it is decided here and only applied there.
 */
export function neighbourAfterClose(state: ExplainState, iid: number): number | null {
  return neighbourOf(state.tabs, iid)
}

/**
 * The move to open when the reader selects tab `iid`: the one they last read in
 * it, else Overview. Exported for the same reason as `neighbourAfterClose` — it
 * is a rule the presenter has to express as a URL.
 */
export function rememberedMove(state: ExplainState, iid: number): string | null {
  return state.lastMove[iid] ?? null
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

export type ExplainTabDisplay = {
  readonly iid: number
  /** `!4211 · HDR-7`, or just `!4211` when no ticket resolved. */
  readonly label: string
  readonly title: string
  readonly phase: ExplainPhase
  readonly isSelected: boolean
  /** Spinner on the tab: a run is in flight behind it. */
  readonly isBusy: boolean
}

/**
 * One entry in the move rail (ADR-0010 §2). `overview` is pinned first and is
 * where the surface lands; the rest are the report's moves in the agent's own
 * order.
 *
 * The entries carry everything the rail draws, because the rail is the thing the
 * reader *scans* — a strip of titles would be a table of contents, and the
 * schema requires a `summary` and a system list precisely so this does not have
 * to be one.
 */
export type ExplainRailEntryDisplay =
  | {
      readonly kind: 'overview'
      readonly isSelected: boolean
      /** The verdict chip, so the conclusion is on screen from every move. */
      readonly verdict: ExplainVerdict | null
      readonly moveCount: number
    }
  | {
      readonly kind: 'move'
      readonly id: string
      /** 1-based, so the rail can number what it lists. */
      readonly position: number
      readonly title: string
      readonly summary: string
      readonly systems: readonly string[]
      readonly fileCount: number
      readonly findingCount: number
      /** The worst finding in the move, rolled up. `null` means nothing flagged. */
      readonly severity: ExplainSeverity | null
      readonly isSelected: boolean
    }

/** The notebook page the rail's selection opens. */
export type ExplainPageDisplay =
  | { readonly kind: 'overview'; readonly blocks: readonly ExplainBlock[] }
  | {
      readonly kind: 'move'
      readonly id: string
      readonly position: number
      readonly total: number
      readonly title: string
      readonly summary: string
      readonly systems: readonly string[]
      /** The files this move spans — what the whole-diff expander asks for. */
      readonly paths: readonly string[]
      readonly severity: ExplainSeverity | null
      readonly blocks: readonly ExplainBlock[]
    }

/** What one finished report's pane needs. */
export type ExplainReportDisplay = {
  readonly kind: 'report'
  readonly iid: number
  readonly title: string
  readonly webUrl: string
  readonly issueKey: string | null
  readonly headSha: string
  readonly generatedAt: string | null
  /** The warning when the MR has moved on since, or freshness is unknown. */
  readonly freshness: string | null
  readonly rail: readonly ExplainRailEntryDisplay[]
  readonly page: ExplainPageDisplay
}

export type ExplainPaneDisplay =
  /** The snapshot has not arrived; say nothing rather than flash "no reviews". */
  | { readonly kind: 'loading' }
  | { readonly kind: 'no-tabs' }
  | { readonly kind: 'none-selected'; readonly count: number }
  /**
   * A start asked for and not yet answered. `title` is the MR's, when a tab
   * already carries one (a re-run); `null` on a hand-off, where the MR has not
   * been read yet and the iid is genuinely all we know.
   */
  | { readonly kind: 'starting'; readonly iid: number; readonly title: string | null }
  | {
      readonly kind: 'working'
      readonly iid: number
      readonly title: string
      readonly webUrl: string
      readonly phase: Extract<ExplainPhase, 'preparing' | 'running'>
      readonly activity: readonly ExplainActivityLine[]
    }
  | ExplainReportDisplay
  | {
      readonly kind: 'failed'
      readonly iid: number
      readonly title: string
      readonly message: string
    }
  | { readonly kind: 'interrupted'; readonly iid: number; readonly title: string }

export type ExplainCloseDisplay = {
  readonly iid: number
  readonly title: string
  /**
   * Whether confirming throws away something that cost minutes. The
   * confirmation exists for exactly this case (ADR-0009 §9); a tab with
   * nothing behind it closes without ceremony.
   */
  readonly costsARun: boolean
}

export type ExplainDisplay = {
  readonly tabs: readonly ExplainTabDisplay[]
  readonly pane: ExplainPaneDisplay
  readonly closing: ExplainCloseDisplay | null
}

function tabLabel(tab: ExplainTab): string {
  return tab.issueKey === null ? `!${tab.iid}` : `!${tab.iid} · ${tab.issueKey}`
}

/** The live overlay's view of a tab, falling back to the server's snapshot. */
function phaseOf(tab: ExplainTab, live: LiveRun | undefined): ExplainPhase {
  return live?.phase ?? tab.phase
}

/**
 * The rail: Overview, then every move in the order the agent wrote them.
 *
 * `selectedId === null` selects Overview, which is also what an unknown slug
 * resolves to — the caller has already resolved it, so by here there is one
 * answer rather than a fallback.
 */
function railFor(
  report: ExplainReport,
  selectedId: string | null,
): readonly ExplainRailEntryDisplay[] {
  const overview: ExplainRailEntryDisplay = {
    kind: 'overview',
    isSelected: selectedId === null,
    verdict: verdictIn(report.overview),
    moveCount: report.moves.length,
  }
  return [
    overview,
    ...report.moves.map(
      (move, index): ExplainRailEntryDisplay => ({
        kind: 'move',
        id: move.id,
        position: index + 1,
        title: move.title,
        summary: move.summary,
        systems: move.systems,
        fileCount: move.paths.length,
        findingCount: findingCountOf(move),
        severity: worstSeverityOf(move),
        isSelected: move.id === selectedId,
      }),
    ),
  ]
}

/**
 * The page for the selected rail entry. `layOutReport` runs **per page** now
 * rather than once per report — the findings-worst-first rule applied to the
 * overview's blocks and to each move's independently, which is the same rule one
 * level down (ADR-0010 §5).
 */
function pageFor(report: ExplainReport, move: ExplainMove | null): ExplainPageDisplay {
  if (move === null) return { kind: 'overview', blocks: layOutReport(report.overview) }
  return {
    kind: 'move',
    id: move.id,
    position: report.moves.indexOf(move) + 1,
    total: report.moves.length,
    title: move.title,
    summary: move.summary,
    systems: move.systems,
    paths: move.paths,
    severity: worstSeverityOf(move),
    blocks: layOutReport(move.blocks),
  }
}

function paneFor(
  tab: ExplainTab,
  live: LiveRun | undefined,
  startError: string | undefined,
  selectedMove: string | null,
): ExplainPaneDisplay {
  const phase = phaseOf(tab, live)
  // A start that never produced a run has no stream and no phase of its own.
  if (startError !== undefined) {
    return { kind: 'failed', iid: tab.iid, title: tab.title, message: startError }
  }
  return match(phase)
    .with(P.union('preparing', 'running'), (settled) => ({
      kind: 'working' as const,
      iid: tab.iid,
      title: tab.title,
      webUrl: tab.webUrl,
      phase: settled,
      activity: live?.activity ?? tab.activity,
    }))
    .with('report', (): ExplainPaneDisplay => {
      const report = live?.report ?? tab.report ?? null
      // `report` with no report cannot happen through the normal path, but a
      // phase and a payload arriving as two messages means it is representable —
      // so it reads as still working rather than as an empty report.
      if (report === null) {
        return {
          kind: 'working',
          iid: tab.iid,
          title: tab.title,
          webUrl: tab.webUrl,
          phase: 'running',
          activity: live?.activity ?? tab.activity,
        }
      }
      // A `?move=` the report does not contain lands on Overview rather than on
      // an error: a link can outlive the report it was written against, and a
      // re-run has no obligation to find the same moves (ADR-0010).
      const move = moveById(report.moves, selectedMove)
      return {
        kind: 'report',
        iid: tab.iid,
        title: tab.title,
        webUrl: tab.webUrl,
        issueKey: tab.issueKey,
        headSha: tab.headSha,
        generatedAt: tab.generatedAt,
        freshness: freshnessWarning(tab.headSha, tab.currentHeadSha),
        rail: railFor(report, move?.id ?? null),
        page: pageFor(report, move),
      }
    })
    .with('failed', () => ({
      kind: 'failed' as const,
      iid: tab.iid,
      title: tab.title,
      message: live?.error ?? tab.error ?? 'the explain run failed',
    }))
    .with('interrupted', () => ({
      kind: 'interrupted' as const,
      iid: tab.iid,
      title: tab.title,
    }))
    .exhaustive()
}

export function deriveExplain(state: ExplainState): ExplainDisplay {
  const tabs = state.tabs.map((tab): ExplainTabDisplay => {
    const phase = phaseOf(tab, state.live[tab.iid])
    return {
      iid: tab.iid,
      label: tabLabel(tab),
      title: tab.title,
      phase,
      isSelected: state.selected === tab.iid,
      isBusy: !isTerminalPhase(phase),
    }
  })

  const selected = state.tabs.find((tab) => tab.iid === state.selected) ?? null
  const pane: ExplainPaneDisplay = (() => {
    if (state.selected === null) {
      if (!state.loaded) return { kind: 'loading' }
      if (state.tabs.length === 0) return { kind: 'no-tabs' }
      return { kind: 'none-selected', count: state.tabs.length }
    }
    const iid = state.selected
    // A start in flight is the present tense, exactly as a live run is: it
    // outranks whatever the tab used to show, because a re-run has already
    // thrown that away.
    if (state.starting.has(iid)) return { kind: 'starting', iid, title: selected?.title ?? null }
    if (selected !== null) {
      return paneFor(selected, state.live[iid], state.startErrors[iid], state.selectedMove)
    }
    // Selected but not in the open set. A start that failed this way never had
    // a tab to carry its message, so the pane is the only place it can appear.
    const startError = state.startErrors[iid]
    if (startError !== undefined) {
      return { kind: 'failed', iid, title: `!${iid}`, message: startError }
    }
    if (!state.loaded) return { kind: 'loading' }
    // The hand-off has landed and the presenter's start-on-arrival has not run
    // yet — one frame, and it must not be the one that says "no reviews open".
    return { kind: 'starting', iid, title: null }
  })()

  const closingTab =
    state.closing === null ? null : (state.tabs.find((tab) => tab.iid === state.closing) ?? null)
  const closing: ExplainCloseDisplay | null =
    closingTab === null
      ? null
      : {
          iid: closingTab.iid,
          title: closingTab.title,
          costsARun: closeCostsARun(closingTab, state.live[closingTab.iid]),
        }

  return { tabs, pane, closing }
}

/**
 * A close is worth confirming when it throws away a finished report or stops a
 * run in flight — both cost another agent run to get back. A failed or
 * interrupted tab with nothing behind it costs nothing, so it closes outright.
 */
export function closeCostsARun(tab: ExplainTab, live: LiveRun | undefined): boolean {
  const phase = phaseOf(tab, live)
  return match(phase)
    .with('report', () => true)
    .with(P.union('preparing', 'running'), () => true)
    .with(P.union('failed', 'interrupted'), () => false)
    .exhaustive()
}

/** Which run the surface should be streaming right now, if any. */
export function streamingRun(state: ExplainState): { iid: number; runId: string } | null {
  if (state.selected === null) return null
  const tab = state.tabs.find((candidate) => candidate.iid === state.selected)
  if (tab === undefined || tab.runId === null) return null
  const live = state.live[tab.iid]
  // Nothing to watch once the run is over; the report is already in hand.
  if (live !== undefined && live.runId === tab.runId && isTerminalPhase(live.phase)) return null
  if (live === undefined && isTerminalPhase(tab.phase)) return null
  return { iid: tab.iid, runId: tab.runId }
}

/** Does this MR already have a tab? Gates the start-on-arrival hand-off. */
export function hasTab(state: ExplainState, iid: number): boolean {
  return state.tabs.some((tab) => tab.iid === iid)
}
