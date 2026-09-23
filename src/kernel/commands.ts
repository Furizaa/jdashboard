// The command palette's action vocabulary.
//
// Every action the palette can offer for a work item is named here once, as a
// string-literal union. `ActionKind` is the discriminant the palette's view-model
// and the route-level catalogue match exhaustively, so adding an action is a
// compile error until every arm handles it. That is the point.

export type ActionKind =
  | 'open-detail'
  | 'change-status'
  | 'open-notes'
  | 'tags'
  | 'watchlist-toggle'
  | 'ai-refine'
  | 'ai-ask'
  | 'open-in-jira'
  | 'copy-jira-link'
  | 'copy-issue-key'
  | 'open-mr'
  | 'review-mr'
  | 'open-workspace'
  | 'focus-workspace'
  | 'discard-workspace'

/**
 * The curated static shortcut map: each action kind owns a fixed letter, so the
 * same key always means the same thing regardless of which actions happen to be
 * legal for the item in front of you. Positional digits were rejected because
 * the key for an action would shift as legality changed; ⌘-modified keys were
 * rejected because ⌘T / ⌘N / ⌘W belong to the browser (see ADR-0008).
 *
 * `j` / `k` are reserved for list navigation everywhere, and `o` / `c` keep the
 * meanings `contexts/detail/domain/panel-key-intent.ts` already gives them.
 *
 * This map is the single source of truth. The in-palette help view and the docs
 * table are both generated from or point at it — never hand-maintained beside it.
 */
export const ACTION_SHORTCUTS: Record<ActionKind, string> = {
  'open-detail': 'd',
  'change-status': 's',
  'open-notes': 'n',
  tags: 't',
  'watchlist-toggle': 'w',
  'ai-refine': 'r',
  'ai-ask': 'a',
  'open-in-jira': 'o',
  'copy-jira-link': 'c',
  'copy-issue-key': 'y',
  'open-mr': 'm',
  'review-mr': 'v',
  'open-workspace': 'e',
  'focus-workspace': 'f',
  'discard-workspace': 'x',
}

/**
 * Presentation grouping for the action list's section headers. Deliberately
 * small — this is layout, not domain. `commands` holds the board-level commands
 * that belong to no work item.
 */
export type ActionGroup = 'workflow' | 'ai' | 'links' | 'workspace' | 'commands'

export const ACTION_GROUP_ORDER: readonly ActionGroup[] = [
  'workflow',
  'ai',
  'links',
  'workspace',
  'commands',
] as const

export const ACTION_GROUP_LABEL: Record<ActionGroup, string> = {
  workflow: 'Workflow',
  ai: 'AI',
  links: 'Links',
  workspace: 'Workspace',
  commands: 'Commands',
}

export const ACTION_GROUPS: Record<ActionKind, ActionGroup> = {
  'open-detail': 'workflow',
  'change-status': 'workflow',
  'open-notes': 'workflow',
  tags: 'workflow',
  'watchlist-toggle': 'workflow',
  'ai-refine': 'ai',
  'ai-ask': 'ai',
  'open-in-jira': 'links',
  'copy-jira-link': 'links',
  'copy-issue-key': 'links',
  'open-mr': 'links',
  'review-mr': 'links',
  'open-workspace': 'workspace',
  'focus-workspace': 'workspace',
  'discard-workspace': 'workspace',
}

/** Human labels for the help view, which is generated from this map. */
export const ACTION_LABELS: Record<ActionKind, string> = {
  'open-detail': 'Open detail',
  'change-status': 'Change Status…',
  'open-notes': 'Open Notes',
  tags: 'Tags…',
  'watchlist-toggle': 'Add to / Remove from Watchlist',
  'ai-refine': 'AI Refine',
  'ai-ask': 'AI Ask',
  'open-in-jira': 'Open in Jira',
  'copy-jira-link': 'Copy Jira Link',
  'copy-issue-key': 'Copy Issue Key',
  'open-mr': 'Open MR in GitLab',
  'review-mr': 'Review MR',
  'open-workspace': 'Open in Workspace',
  'focus-workspace': 'Focus Workspace',
  'discard-workspace': 'Discard Workspace',
}

/**
 * The guard that keeps the curated-map decision honest as actions get added: two
 * kinds claiming the same letter is a load-time crash, not a mystery keypress
 * that runs the wrong action. Runs unconditionally — the map is static, so a map
 * that passes here passes everywhere.
 */
function assertNoShortcutCollisions(map: Record<ActionKind, string>): void {
  const claimed = new Map<string, string>()
  for (const [kind, key] of Object.entries(map)) {
    const prior = claimed.get(key)
    if (prior !== undefined) {
      throw new Error(
        `ACTION_SHORTCUTS collision: "${key}" is claimed by both "${prior}" and "${kind}"`,
      )
    }
    claimed.set(key, kind)
  }
}

assertNoShortcutCollisions(ACTION_SHORTCUTS)

/** Exported for the unit test that asserts the shipped map is collision-free. */
export const assertShortcutsUnique = assertNoShortcutCollisions
