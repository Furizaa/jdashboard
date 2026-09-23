import { match } from 'ts-pattern'
import type { RefineAnswer, RefineClarification, RefineQuestion } from '~/kernel'

// Bulk Refine is a small wizard: paste a transcript → route it (stage 1) → pick
// tickets → refine each (stage 2) → summary. Stage 2 is batched by ticket: a
// "gathering" pass refines every clear ticket and collects questions from the
// ambiguous ones; those are reviewed together, grouped by ticket, then an
// "applying" pass finishes them with the answers folded in (a rare dependent
// follow-up loops back for another short round). Framework-free state machine.
//
//   closed → input → routing → preview → gathering → [questions ⇄ applying] → done
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

// A ticket in a stage-2 pass. `awaiting` = the agent asked clarifying questions
// and is waiting for the user (its questions live in the `grills` map).
export type ApplyStatus = 'pending' | 'refining' | 'awaiting' | 'done' | 'failed'
export type ApplyItem = {
  readonly key: string
  readonly summary: string
  readonly status: ApplyStatus
  readonly error?: string
}

// A ticket the agent grilled: its questions, the user's in-progress answer draft,
// and the clarifications already settled in earlier rounds. Keyed by ticket key in
// the `grills` map; `brief` is the routed refine text, re-sent on every pass.
export type TicketGrill = {
  readonly key: string
  readonly summary: string
  readonly brief: string
  readonly questions: readonly RefineQuestion[]
  readonly answers: readonly RefineAnswer[]
  readonly priorAnswers: readonly RefineClarification[]
}

export type Grills = Readonly<Record<string, TicketGrill>>

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
  | { phase: 'gathering'; items: readonly ApplyItem[]; grills: Grills; round: number }
  | { phase: 'questions'; items: readonly ApplyItem[]; grills: Grills; round: number }
  | { phase: 'applying'; items: readonly ApplyItem[]; grills: Grills; round: number }
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
  // Start the first stage-2 pass (gathering) over the picked tickets.
  | { type: 'gatherStarted'; items: readonly ApplyItem[] }
  | { type: 'ticketStarted'; key: string }
  // A pass finished one ticket: a note (done), questions (awaiting), or a failure.
  | { type: 'ticketNoted'; key: string }
  | {
      type: 'ticketAsked'
      key: string
      summary: string
      brief: string
      questions: readonly RefineQuestion[]
    }
  | { type: 'ticketFailed'; key: string; message: string }
  // A whole pass drained: to the review if anything is awaiting, else the summary.
  | { type: 'passSettled' }
  // The user edited one ticket's answer draft in the review step.
  | { type: 'answersChanged'; key: string; answers: readonly RefineAnswer[] }
  // Submit the review: `resolved` is each awaiting ticket's answers as
  // clarifications. Starts the next (applying) pass.
  | { type: 'applyStarted'; resolved: Readonly<Record<string, readonly RefineClarification[]>> }

export const initialState: State = { phase: 'closed' }

export function reduce(state: State, event: Event): State {
  return match(event)
    .with({ type: 'opened' }, () =>
      match(state)
        .with({ phase: 'closed' }, (): State => ({ phase: 'input', transcript: '' }))
        .otherwise(() => state),
    )
    .with({ type: 'closed' }, () =>
      // Blocked mid-flight (routing / a running pass); every settled step —
      // including the question review — is closable and resets to `closed`.
      match(state)
        .with({ phase: 'routing' }, { phase: 'gathering' }, { phase: 'applying' }, () => state)
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
    .with({ type: 'gatherStarted' }, ({ items }) =>
      match(state)
        .with(
          { phase: 'preview' },
          (): State =>
            items.length === 0 ? state : { phase: 'gathering', items, grills: {}, round: 1 },
        )
        .otherwise(() => state),
    )
    .with({ type: 'ticketStarted' }, ({ key }) =>
      onPass(state, (s) => ({ ...s, items: setStatus(s.items, key, { status: 'refining' }) })),
    )
    .with({ type: 'ticketNoted' }, ({ key }) =>
      onPass(state, (s) => ({ ...s, items: setStatus(s.items, key, { status: 'done' }) })),
    )
    .with({ type: 'ticketFailed' }, ({ key, message }) =>
      onPass(state, (s) => ({
        ...s,
        items: setStatus(s.items, key, { status: 'failed', error: message }),
      })),
    )
    .with({ type: 'ticketAsked' }, ({ key, summary, brief, questions }) =>
      onPass(state, (s) => ({
        ...s,
        items: setStatus(s.items, key, { status: 'awaiting' }),
        grills: {
          ...s.grills,
          [key]: {
            key,
            summary,
            brief,
            questions,
            answers: [],
            // Keep clarifications settled in earlier rounds (applyStarted folds
            // each round's answers in before the pass); [] on the first ask.
            priorAnswers: s.grills[key]?.priorAnswers ?? [],
          },
        },
      })),
    )
    .with({ type: 'passSettled' }, () =>
      match(state)
        .with(
          { phase: 'gathering' },
          { phase: 'applying' },
          (s): State =>
            s.items.some((i) => i.status === 'awaiting')
              ? { phase: 'questions', items: s.items, grills: s.grills, round: s.round }
              : { phase: 'done', items: s.items },
        )
        .otherwise(() => state),
    )
    .with({ type: 'answersChanged' }, ({ key, answers }) =>
      match(state)
        .with({ phase: 'questions' }, (s): State => {
          const grill = s.grills[key]
          if (grill === undefined) return s
          return { ...s, grills: { ...s.grills, [key]: { ...grill, answers } } }
        })
        .otherwise(() => state),
    )
    .with({ type: 'applyStarted' }, ({ resolved }) =>
      match(state)
        .with({ phase: 'questions' }, (s): State => {
          const grills: Record<string, TicketGrill> = {}
          let items = s.items
          for (const [key, grill] of Object.entries(s.grills)) {
            if (s.items.find((i) => i.key === key)?.status !== 'awaiting') {
              grills[key] = grill
              continue
            }
            grills[key] = {
              ...grill,
              answers: [],
              priorAnswers: [...grill.priorAnswers, ...(resolved[key] ?? [])],
            }
            items = setStatus(items, key, { status: 'refining' })
          }
          return { phase: 'applying', items, grills, round: s.round + 1 }
        })
        .otherwise(() => state),
    )
    .exhaustive()
}

// Apply an update only while a stage-2 pass runs; per-ticket events are ignored
// in any other phase.
function onPass(
  state: State,
  update: (s: Extract<State, { phase: 'gathering' | 'applying' }>) => State,
): State {
  return match(state)
    .with({ phase: 'gathering' }, { phase: 'applying' }, (s) => update(s))
    .otherwise(() => state)
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
      step: 'gathering'
      items: readonly ApplyItem[]
      finishedCount: number
      total: number
    }
  | {
      open: true
      step: 'questions'
      grills: readonly TicketGrill[]
      round: number
      settledCount: number
    }
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

// "Finished" for a running pass = has a note, a failure, or a pending question.
const isPassFinished = (i: ApplyItem): boolean => i.status !== 'pending' && i.status !== 'refining'

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
      { phase: 'gathering' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'gathering',
        items: s.items,
        finishedCount: s.items.filter(isPassFinished).length,
        total: s.items.length,
      }),
    )
    .with(
      { phase: 'questions' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'questions',
        // Only tickets still awaiting answers, in a stable order.
        grills: s.items
          .filter((i) => i.status === 'awaiting')
          .map((i) => s.grills[i.key])
          .filter((g): g is TicketGrill => g !== undefined),
        round: s.round,
        settledCount: s.items.filter((i) => i.status === 'done').length,
      }),
    )
    .with(
      { phase: 'applying' },
      (s): BulkRefineDisplay => ({
        open: true,
        step: 'applying',
        items: s.items,
        finishedCount: s.items.filter(isPassFinished).length,
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
  return state.phase === 'routing' || state.phase === 'gathering' || state.phase === 'applying'
}
