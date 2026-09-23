import { match } from 'ts-pattern'
import { workItemJiraKey, type ActionKind, type MrRef, type WorkItem } from '~/kernel'

// Which actions are legal for one work item, and what each is called. Pure over
// the item plus a snapshot of the state the answer depends on — so the rule can
// be exercised by call-and-assert rather than by rendering a palette.
//
// Legality is **derived from item state, never hardcoded per surface**. There is
// no `if (isReviewFake)` anywhere below: a fake review card simply has no Jira
// key, so every ticket-shaped action falls away and only the MR pair survives.

/** The state legality depends on, read once per render by the catalogue hook. */
export type ActionContext = {
  /** `null` until the board has loaded — without it there is no Jira URL to build. */
  readonly jiraBaseUrl: string | null
  readonly watchlistKeys: readonly string[]
  readonly openWorkspaceKeys: readonly string[]
  /** The MR for this item, if one resolves (authored, or one we review). */
  readonly mr: MrRef | null
  /**
   * Whether this ticket has any legal transitions. `unknown` covers "the fetch
   * has not resolved" — and it has to, because Jira decides per ticket. `s` is
   * therefore offered optimistically and the sub-list says what happened; the
   * alternative would be never offering it until a fetch the palette has no
   * reason to have made yet.
   */
  readonly transitions: 'unknown' | 'none' | 'some'
  /** How many tags are defined at all. `t` against none is a dead end. */
  readonly tagCount: number
}

export type ActionDescriptor = {
  readonly kind: ActionKind
  readonly label: string
}

export function legalActions(item: WorkItem, context: ActionContext): readonly ActionDescriptor[] {
  const key = workItemJiraKey(item)
  const descriptors: ActionDescriptor[] = []

  if (key !== null) {
    descriptors.push({ kind: 'open-detail', label: 'Open detail' })
    // Offered unless we positively know there is nowhere to go. See `transitions`.
    if (context.transitions !== 'none') {
      descriptors.push({ kind: 'change-status', label: 'Change Status…' })
    }
    descriptors.push(
      { kind: 'open-notes', label: 'Open Notes' },
      {
        kind: 'watchlist-toggle',
        // The label flips on membership, and so does the mutation behind it.
        label: context.watchlistKeys.includes(key) ? 'Remove from Watchlist' : 'Add to Watchlist',
      },
    )
    // `t` against no definitions would open an empty list; the Manage Tags
    // command is where you go instead, and it is one level up.
    if (context.tagCount > 0) descriptors.push({ kind: 'tags', label: 'Tags…' })
    // Both hand off to the note editor's own modals through the URL, so they are
    // legal on anything with a ticket and absent on a fake review card.
    descriptors.push({ kind: 'ai-refine', label: 'AI Refine' }, { kind: 'ai-ask', label: 'AI Ask' })
    if (context.jiraBaseUrl !== null) {
      descriptors.push(
        { kind: 'open-in-jira', label: 'Open in Jira' },
        { kind: 'copy-jira-link', label: 'Copy Jira Link' },
      )
    }
    descriptors.push({ kind: 'copy-issue-key', label: 'Copy Issue Key' })
  }

  if (context.mr !== null) {
    descriptors.push(
      { kind: 'open-mr', label: 'Open MR in GitLab' },
      { kind: 'review-mr', label: 'Review MR' },
    )
  }

  const workspaceKey = workspaceTargetKey(item)
  if (workspaceKey !== null) {
    // Mutually exclusive by construction rather than by two independent checks
    // that could both be true.
    descriptors.push(
      ...(context.openWorkspaceKeys.includes(workspaceKey)
        ? ([
            { kind: 'focus-workspace', label: 'Focus Workspace' },
            { kind: 'discard-workspace', label: 'Discard Workspace' },
          ] as const)
        : ([{ kind: 'open-workspace', label: 'Open in Workspace' }] as const)),
    )
  }

  return descriptors
}

/**
 * The ticket a workspace would be opened for. A workspace is a git worktree for
 * a ticket, so a `review-fake` card — an MR with no ticket — has none, even
 * though it does have a branch.
 */
export function workspaceTargetKey(item: WorkItem): string | null {
  return match(item)
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) => i.issue.key)
    .with({ kind: 'review-real' }, (i) => i.card.jira.key)
    .with({ kind: 'review-fake' }, () => null)
    .exhaustive()
}

/** The type name and title a workspace's branch slug is built from. */
export function workspaceTargetFields(
  item: WorkItem,
): { readonly typeName: string; readonly title: string } | null {
  return match(item)
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) => ({
      typeName: i.issue.typeName,
      title: i.issue.summary,
    }))
    .with({ kind: 'review-real' }, (i) => ({
      typeName: i.card.jira.typeName,
      title: i.card.jira.summary,
    }))
    .with({ kind: 'review-fake' }, () => null)
    .exhaustive()
}
