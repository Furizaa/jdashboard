import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import { toast } from 'sonner'
import type { PaletteSubItem, PaletteSubList, SubListKind } from '~/contexts/command-palette'
import {
  useAttachTag,
  useDetachTag,
  useGanttCharts,
  useTagDefinitions,
  useTicketTags,
  useTransitionAction,
  useTransitions,
} from '~/coordinator'
import {
  resolveTagColor,
  workItemJiraKey,
  type GanttChartSummary,
  type GetTransitionsResult,
  type WorkItem,
} from '~/kernel'
import { displayNameForStatus } from '~/widgets/status-pill'

// The contents of the palette's three nested lists. All of them are
// cross-context reads, so they live here beside the action catalogue (ADR-0008).
//
// The asymmetry is real and deliberate: **transitions are async and per-ticket**
// (Jira decides what a ticket can become), where **tags and charts are already
// in the cache**. The descriptor union only gives `status` loading and failed
// arms for exactly that reason.
//
// `charts` is the one list that belongs to **no work item** — it is opened by a
// root-level command, so `item` arrives `null` and nothing in that arm reads it.

// A sentinel key so the transitions query has a stable shape while nothing is
// selected; `enabled: false` means it never actually runs. Mirrors `useTicket`.
const NO_KEY = '__none__'

/** Whether a ticket has transitions, as far as anyone currently knows. */
export type TransitionsKnowledge = 'unknown' | 'none' | 'some'

export type SubListsApi = {
  readonly subListFor: (item: WorkItem | null, kind: SubListKind) => PaletteSubList
  /**
   * Feeds `s`'s legality. `unknown` while the fetch is in flight or failed —
   * which is why `s` can appear and only then turn out to have nothing in it.
   */
  readonly transitions: TransitionsKnowledge
  readonly tagCount: number
}

function report(
  verb: string,
  running: Promise<{ ok: boolean; error?: { message: string } }>,
): void {
  running
    .then((result) => {
      if (!result.ok) toast.error(`${verb} failed: ${result.error?.message ?? 'Unknown error'}`)
    })
    .catch((error: unknown) => {
      toast.error(`${verb} failed: ${error instanceof Error ? error.message : String(error)}`)
    })
}

// The transitions error is a tagged union with no message field, so the wording
// is ours — same two cases the status pill's own dropdown distinguishes.
function transitionFailure(data: Extract<GetTransitionsResult, { ok: false }>): string {
  // oxlint-disable-next-line no-underscore-dangle -- `_tag` is the standard discriminator on Effect Schema tagged errors
  return data.error._tag === 'Unauthorized'
    ? 'Jira rejected the request — check your credentials.'
    : "Couldn't load transitions for this ticket. Try again."
}

function knowledgeOf(query: {
  data: GetTransitionsResult | undefined
  isPending: boolean
  isError: boolean
}): TransitionsKnowledge {
  if (query.isPending || query.isError || query.data === undefined) return 'unknown'
  if (!query.data.ok) return 'unknown'
  return query.data.transitions.length === 0 ? 'none' : 'some'
}

/**
 * `activeKey` is the ticket whose action list is open — the palette announces it
 * on entering an item, so the transitions fetch happens once per item rather
 * than once per search result.
 */
/**
 * Every chart on disk, in the order the store lists them. Choosing one
 * **navigates** — the palette hands off through the URL and still imports no
 * context, exactly as `explain-mr` does (ADR-0009 §3).
 */
function chartsList(
  charts: readonly GanttChartSummary[] | undefined,
  open: (chartId: string) => void,
): PaletteSubList {
  return {
    kind: 'charts',
    items: (charts ?? []).map(
      (chart): PaletteSubItem => ({ id: chart.id, label: chart.title, run: () => open(chart.id) }),
    ),
  }
}

export function useSubLists(activeKey: string | null): SubListsApi {
  const enabled = activeKey !== null
  const transitionsQuery = useTransitions(activeKey ?? NO_KEY, enabled)
  const transition = useTransitionAction()
  const definitions = useTagDefinitions()
  const attached = useTicketTags(activeKey ?? '')
  const { attach } = useAttachTag()
  const { detach } = useDetachTag()
  const navigateFn = useNavigate()
  const chartRows = useGanttCharts().data?.charts
  const openChart = useCallback(
    (chartId: string) => navigateFn({ to: '/gantt', search: { chart: chartId } }),
    [navigateFn],
  )

  const transitions = knowledgeOf(transitionsQuery)
  const transitionsPending = transitionsQuery.isPending
  // Split into "the request broke" and "the request answered": an error
  // envelope carries a message worth showing, a transport failure does not.
  const transitionsData = transitionsQuery.isError ? undefined : transitionsQuery.data
  const transitionsBroke = transitionsQuery.isError

  const subListFor = useCallback(
    (item: WorkItem | null, kind: SubListKind): PaletteSubList =>
      match(kind)
        .with('status', (): PaletteSubList => {
          const key = item === null ? null : workItemJiraKey(item)
          if (key === null || transitionsPending) return { kind: 'status', state: 'loading' }
          if (transitionsBroke || transitionsData === undefined) {
            return {
              kind: 'status',
              state: 'failed',
              message: "Couldn't load transitions for this ticket. Try again.",
            }
          }
          if (transitionsData.ok !== true) {
            return { kind: 'status', state: 'failed', message: transitionFailure(transitionsData) }
          }
          return {
            kind: 'status',
            state: 'ready',
            items: transitionsData.transitions.map(
              (allowed): PaletteSubItem => ({
                id: allowed.id,
                label: displayNameForStatus(allowed.toStatusName),
                // The coordinator's `applyTransition`: optimistic board + panel
                // patch, rollback on failure, toast. Not reimplemented here.
                run: () =>
                  transition.mutate({
                    key,
                    transitionId: allowed.id,
                    toStatusName: allowed.toStatusName,
                  }),
              }),
            ),
          }
        })
        .with('tags', (): PaletteSubList => {
          const key = item === null ? null : workItemJiraKey(item)
          const attachedIds = new Set(attached.map((tag) => tag.id))
          return {
            kind: 'tags',
            items:
              key === null
                ? []
                : definitions.map((tag): PaletteSubItem => {
                    const isAttached = attachedIds.has(tag.id)
                    const color = resolveTagColor(tag.colorId)
                    return {
                      id: tag.id,
                      label: tag.name,
                      checked: isAttached,
                      swatch: { bg: color.swatchBg, fg: color.swatchFg },
                      run: () =>
                        report(
                          isAttached ? 'Remove tag' : 'Attach tag',
                          isAttached ? detach(key, tag.id) : attach(key, tag.id),
                        ),
                    }
                  }),
          }
        })
        .with('charts', (): PaletteSubList => chartsList(chartRows, openChart))
        .exhaustive(),
    [
      chartRows,
      openChart,
      transitionsPending,
      transitionsBroke,
      transitionsData,
      transition,
      definitions,
      attached,
      attach,
      detach,
    ],
  )

  return { subListFor, transitions, tagCount: definitions.length }
}
