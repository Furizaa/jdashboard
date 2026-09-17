import { match } from 'ts-pattern'

// Bulk Refine is a small wizard: paste a transcript → route it (stage 1) → pick
// which matched tickets to apply → refine each (stage 2) with per-ticket
// progress → summary. This is the framework-free state machine; the presenter
// binds it to React and drives the two async stages.
//
//   closed → input → routing → preview → applying → done
//                       └→ no-matches        (routing found nothing)
//                       └→ route-error        (stage 1 failed)

// One matched ticket in the preview step: the agent's brief joined with the
// ticket's summary (from the board target list) and a checkbox state.
export type SelectableMatch = {
  readonly key: string
  readonly summary: string
  readonly brief: string
  readonly selected: boolean
}

// A ticket being (or already) refined in stage 2.
export type ApplyStatus = 'pending' | 'refining' | 'done' | 'failed'
export type ApplyItem = {
  readonly key: string
  readonly summary: string
  readonly status: ApplyStatus
  readonly error?: string
}

// The agent's stage-1 output, joined with summaries by the presenter.
export type RoutedMatch = {
  readonly key: string
  readonly summary: string
  readonly brief: string
}

export type State =
  | { phase: 'closed' }
  | { phase: 'input'; transcript: string }
  | { phase: 'routing'; transcript: string }
  | { phase: 'preview'; matches: readonly SelectableMatch[] }
  | { phase: 'no-matches' }
  | { phase: 'applying'; items: readonly ApplyItem[] }
  | { phase: 'done'; items: readonly ApplyItem[] }
  | { phase: 'route-error'; transcript: string; message: string }

export type Event =
  | { type: 'opened' }
  | { type: 'closed' }
  | { type: 'setTranscript'; transcript: string }
  | { type: 'routeStarted' }
  | { type: 'routed'; matches: readonly RoutedMatch[] }
  | { type: 'routeFailed'; message: string }
  | { type: 'toggled'; key: string }
  | { type: 'applyStarted'; items: readonly ApplyItem[] }
  | { type: 'ticketStarted'; key: string }
  | { type: 'ticketFinished'; key: string; ok: boolean; message?: string }
  | { type: 'applyFinished' }

export const initialState: State = { phase: 'closed' }

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'opened' }, () =>
      match(state)
        .with({ phase: 'closed' }, (): State => ({ phase: 'input', transcript: '' }))
        .otherwise(() => state),
    )
    .with({ type: 'closed' }, () =>
      // Blocked mid-flight (routing / applying): an agent run or note writes are
      // in progress. Every settled step is closable and resets to `closed`.
      match(state)
        .with({ phase: 'routing' }, { phase: 'applying' }, () => state)
        .otherwise((): State => ({ phase: 'closed' })),
    )
    .with({ type: 'setTranscript' }, ({ transcript }) =>
      match(state)
        .with({ phase: 'input' }, (): State => ({ phase: 'input', transcript }))
        .with(
          { phase: 'route-error' },
          (s): State => ({ phase: 'route-error', transcript, message: s.message }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'routeStarted' }, () =>
      match(state)
        .with(
          { phase: 'input' },
          { phase: 'route-error' },
          (s): State => ({ phase: 'routing', transcript: s.transcript }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'routed' }, ({ matches }) =>
      match(state)
        .with(
          { phase: 'routing' },
          (): State =>
            matches.length === 0
              ? { phase: 'no-matches' }
              : {
                  phase: 'preview',
                  matches: matches.map((m) => ({ ...m, selected: true })),
                },
        )
        .otherwise(() => state),
    )
    .with({ type: 'routeFailed' }, ({ message }) =>
      match(state)
        .with(
          { phase: 'routing' },
          (s): State => ({ phase: 'route-error', transcript: s.transcript, message }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'toggled' }, ({ key }) =>
      match(state)
        .with(
          { phase: 'preview' },
          (s): State => ({
            phase: 'preview',
            matches: s.matches.map((m) => (m.key === key ? { ...m, selected: !m.selected } : m)),
          }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'applyStarted' }, ({ items }) =>
      match(state)
        .with(
          { phase: 'preview' },
          (): State => (items.length === 0 ? state : { phase: 'applying', items }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'ticketStarted' }, ({ key }) =>
      match(state)
        .with(
          { phase: 'applying' },
          (s): State => ({
            phase: 'applying',
            items: setStatus(s.items, key, { status: 'refining' }),
          }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'ticketFinished' }, ({ key, ok, message }) =>
      match(state)
        .with(
          { phase: 'applying' },
          (s): State => ({
            phase: 'applying',
            items: setStatus(
              s.items,
              key,
              ok ? { status: 'done' } : { status: 'failed', error: message },
            ),
          }),
        )
        .otherwise(() => state),
    )
    .with({ type: 'applyFinished' }, () =>
      match(state)
        .with({ phase: 'applying' }, (s): State => ({ phase: 'done', items: s.items }))
        .otherwise(() => state),
    )
    .exhaustive()
}

function setStatus(
  items: readonly ApplyItem[],
  key: string,
  patch: { status: ApplyStatus; error?: string },
): readonly ApplyItem[] {
  return items.map((item) =>
    item.key === key ? { key: item.key, summary: item.summary, ...patch } : item,
  )
}

// -- Display derivation -----------------------------------------------------

export type BulkRefineDisplay =
  | { open: false }
  | { open: true; step: 'input'; transcript: string; canRoute: boolean }
  | { open: true; step: 'routing' }
  | {
      open: true
      step: 'preview'
      matches: readonly SelectableMatch[]
      selectedCount: number
      canApply: boolean
    }
  | { open: true; step: 'no-matches' }
  | {
      open: true
      step: 'applying'
      items: readonly ApplyItem[]
      finishedCount: number
      total: number
    }
  | {
      open: true
      step: 'done'
      items: readonly ApplyItem[]
      okCount: number
      failCount: number
    }
  | { open: true; step: 'route-error'; transcript: string; message: string; canRoute: boolean }

export function deriveBulkRefine(state: State): BulkRefineDisplay {
  return match(state)
    .with({ phase: 'closed' }, (): BulkRefineDisplay => ({ open: false }))
    .with(
      { phase: 'input' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'input',
        transcript: s.transcript,
        canRoute: s.transcript.trim() !== '',
      }),
    )
    .with({ phase: 'routing' }, (): BulkRefineDisplay => ({ open: true, step: 'routing' }))
    .with({ phase: 'preview' }, (s): BulkRefineDisplay => {
      const selectedCount = s.matches.filter((m) => m.selected).length
      return {
        open: true,
        step: 'preview',
        matches: s.matches,
        selectedCount,
        canApply: selectedCount > 0,
      }
    })
    .with({ phase: 'no-matches' }, (): BulkRefineDisplay => ({ open: true, step: 'no-matches' }))
    .with(
      { phase: 'applying' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'applying',
        items: s.items,
        finishedCount: s.items.filter((i) => i.status === 'done' || i.status === 'failed').length,
        total: s.items.length,
      }),
    )
    .with(
      { phase: 'done' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'done',
        items: s.items,
        okCount: s.items.filter((i) => i.status === 'done').length,
        failCount: s.items.filter((i) => i.status === 'failed').length,
      }),
    )
    .with(
      { phase: 'route-error' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'route-error',
        transcript: s.transcript,
        message: s.message,
        canRoute: s.transcript.trim() !== '',
      }),
    )
    .exhaustive()
}

// The modal blocks close while an agent run or note writes are in flight.
export function isBusy(state: State): boolean {
  return state.phase === 'routing' || state.phase === 'applying'
}
