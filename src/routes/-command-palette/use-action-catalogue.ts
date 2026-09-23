import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { match } from 'ts-pattern'
import { toast } from 'sonner'
import type { PaletteAction, PaletteActionPerform } from '~/contexts/command-palette'
import type { WorkspaceActionsApi } from '~/contexts/detail'
import {
  useAddToWatchlist,
  useBoardData,
  useBrowserActions,
  useMrStatuses,
  useOpenWorkspaceKeys,
  useRemoveFromWatchlist,
  useReviewCards,
  useWatchlistCards,
  type BrowserActions,
} from '~/coordinator'
import { resolveMrForWorkItem, workItemJiraKey, type ActionKind, type WorkItem } from '~/kernel'
import { reviewMr } from '~/server/server-functions/detail'
import {
  legalActions,
  workspaceTargetFields,
  workspaceTargetKey,
  type ActionContext,
} from './action-legality'

// THE cross-context assembly. The one place that knows both what the palette
// wants (`PaletteAction` descriptors) and which hook implements each action. It
// lives in `routes/` because `routes/` is the only place multiple contexts
// compose (ADR-0007) — which is what keeps `contexts/command-palette/` free of a
// single cross-context import (ADR-0008).
//
// Nothing here is new behaviour. Every action is an existing capability, newly
// reachable from the keyboard: the same navigation, the same mutations, the same
// toasts, the same modals.
//
// Legality and labels are decided by the pure `legalActions`; this module only
// attaches the effect. Splitting them that way is what makes legality testable
// without rendering anything.

export type ActionCatalogueDeps = {
  /** Mounted by the host; owns the branch prompt and the discard confirmation. */
  readonly workspace: WorkspaceActionsApi
  /** What is known about the active ticket's transitions — gates `s`. */
  readonly transitions: ActionContext['transitions']
  /** How many tags exist at all — gates `t`. */
  readonly tagCount: number
}

type RunnerDeps = {
  readonly navigate: (search: { issue: string; notes?: true }) => void
  readonly browser: BrowserActions
  readonly addToWatchlist: (key: string) => Promise<{ ok: boolean }>
  readonly removeFromWatchlist: (key: string) => Promise<{ ok: boolean }>
  readonly workspace: WorkspaceActionsApi
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

/** Sugar so each arm below reads as one line. */
const run = (fn: () => void): PaletteActionPerform => ({ effect: 'run', run: fn })

/**
 * What one action kind does, or `null` when the palette cannot do it yet.
 * Matched exhaustively, so adding an `ActionKind` is a compile error until it is
 * handled here — which is the point of the kernel union.
 */
function performFor(
  kind: ActionKind,
  item: WorkItem,
  context: ActionContext,
  deps: RunnerDeps,
): PaletteActionPerform | null {
  const key = workItemJiraKey(item)
  const jiraUrl =
    key !== null && context.jiraBaseUrl !== null ? `${context.jiraBaseUrl}/browse/${key}` : null
  const workspaceKey = workspaceTargetKey(item)

  return (
    match(kind)
      // `to: '.'` is applied by the caller's `navigate`, so opening a ticket keeps
      // whichever board you are on rather than throwing you back to the main one.
      .with('open-detail', () => (key === null ? null : run(() => deps.navigate({ issue: key }))))
      .with('open-notes', () =>
        key === null ? null : run(() => deps.navigate({ issue: key, notes: true })),
      )
      // The two nested lists. Their contents come from `useSubLists`; the
      // descriptor only declares that choosing them navigates rather than acts.
      .with('change-status', () =>
        key === null ? null : ({ effect: 'sub-list', subList: 'status' } as const),
      )
      .with('tags', () =>
        key === null ? null : ({ effect: 'sub-list', subList: 'tags' } as const),
      )
      .with('watchlist-toggle', () => {
        if (key === null) return null
        const onWatchlist = context.watchlistKeys.includes(key)
        // A direct mutation, not a trip through `WatchlistModal` — that modal
        // exists to *find* a ticket, which the palette has already done.
        return run(() =>
          report(
            onWatchlist ? 'Remove from watchlist' : 'Add to watchlist',
            onWatchlist ? deps.removeFromWatchlist(key) : deps.addToWatchlist(key),
          ),
        )
      })
      .with('open-in-jira', () =>
        jiraUrl === null ? null : run(() => deps.browser.openInNewTab(jiraUrl)),
      )
      .with('copy-jira-link', () =>
        jiraUrl === null ? null : run(() => deps.browser.copyWithToast(jiraUrl, 'Link')),
      )
      .with('copy-issue-key', () =>
        key === null ? null : run(() => deps.browser.copyWithToast(key, 'Issue key')),
      )
      .with('open-mr', () => {
        const mr = context.mr
        return mr === null ? null : run(() => deps.browser.openInNewTab(mr.webUrl))
      })
      .with('review-mr', () => {
        const mr = context.mr
        return mr === null
          ? null
          : run(() => report('Review MR', reviewMr({ data: { iid: mr.iid } })))
      })
      .with('open-workspace', () => {
        const fields = workspaceTargetFields(item)
        if (workspaceKey === null || fields === null) return null
        // Opens the panel's existing branch-name prompt. It carries the
        // worktree-already-exists warning and the existing-MR-branch reuse, so
        // skipping it would create a branch the user never saw.
        return run(() => deps.workspace.startOpen({ issueKey: workspaceKey, ...fields }))
      })
      .with('focus-workspace', () =>
        workspaceKey === null ? null : run(() => deps.workspace.focus(workspaceKey)),
      )
      // Destructive, so it opens the same confirmation the panel shows rather
      // than force-removing a worktree on one keystroke.
      .with('discard-workspace', () =>
        workspaceKey === null ? null : run(() => deps.workspace.requestDiscard(workspaceKey)),
      )
      // The AI hand-offs arrive in slice 88. `legalActions` does not offer them
      // yet, so this arm is unreachable today — it exists so that adding a kind
      // to the kernel union fails the build here until it is wired, rather than
      // silently going missing from the palette.
      .with('ai-refine', 'ai-ask', () => null)
      .exhaustive()
  )
}

export function useActionCatalogue({
  workspace,
  transitions,
  tagCount,
}: ActionCatalogueDeps): (item: WorkItem) => readonly PaletteAction[] {
  const navigateFn = useNavigate()
  const board = useBoardData()
  const watchlist = useWatchlistCards()
  const mrStatuses = useMrStatuses()
  const reviewQuery = useReviewCards()
  const openWorkspaceKeys = useOpenWorkspaceKeys()
  const { add } = useAddToWatchlist()
  const { remove } = useRemoveFromWatchlist()
  const browser = useBrowserActions()

  const jiraBaseUrl = board.data?.ok === true ? board.data.baseUrl : null
  // Held as the query's own array rather than a fresh `.map` per render, so the
  // catalogue callback below has a stable identity.
  const watchlistCards = watchlist.data?.ok === true ? watchlist.data.cards : undefined
  const authoredByKey = mrStatuses.data?.ok === true ? mrStatuses.data.byKey : undefined
  const reviewCards = reviewQuery.data?.ok === true ? reviewQuery.data.cards : undefined

  const navigate = useCallback(
    (search: { issue: string; notes?: true }) => navigateFn({ to: '.', search }),
    [navigateFn],
  )

  return useCallback(
    (item: WorkItem): readonly PaletteAction[] => {
      const context: ActionContext = {
        jiraBaseUrl,
        watchlistKeys: watchlistCards?.map((card) => card.key) ?? [],
        openWorkspaceKeys,
        mr: resolveMrForWorkItem(item, { authoredByKey, reviewCards }),
        transitions,
        tagCount,
      }
      const deps: RunnerDeps = {
        navigate,
        browser,
        addToWatchlist: add,
        removeFromWatchlist: remove,
        workspace,
      }
      return legalActions(item, context).flatMap((descriptor) => {
        const perform = performFor(descriptor.kind, item, context, deps)
        // A legal action with nothing to perform cannot happen —
        // `action-legality.test.ts` asserts every kind it can emit resolves to
        // one — so dropping it is the safe way to say "impossible" without
        // rendering a dead row.
        return perform === null
          ? []
          : [{ ...descriptor, enabled: true, perform } satisfies PaletteAction]
      })
    },
    [
      jiraBaseUrl,
      watchlistCards,
      openWorkspaceKeys,
      authoredByKey,
      reviewCards,
      navigate,
      browser,
      add,
      remove,
      workspace,
      transitions,
      tagCount,
    ],
  )
}
