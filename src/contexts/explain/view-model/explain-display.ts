import { match, P } from 'ts-pattern'
import type {
  ExplainActivityLine,
  ExplainBlock,
  ExplainMove,
  ExplainPhase,
  ExplainReport,
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
import { isTerminalPhase, type ExplainState, type LiveRun } from './explain-state'

// The derivation half of the Explain view-model: `ExplainState` in, the display
// shapes the views render out. The state machine that produces that state lives
// in `explain-state.ts`.
//
// Nothing here holds state or reaches for a framework (ADR-0003): every function
// is a pure projection, so what the surface shows for a given state is testable
// by calling one function.

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
