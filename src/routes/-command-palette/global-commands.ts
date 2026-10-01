import type { CommandTarget } from '~/coordinator'
import type { ShellVariant } from '../-app-chrome'

// Which board-level commands the palette offers, and what each is called. Pure
// over a snapshot of route + board state, so route-scoped legality is exercised
// by call-and-assert — the same split as `action-legality.ts`.

/** Every board-level command, named once. */
export type CommandId =
  | 'filter-board'
  | 'clear-board-filter'
  | 'new-ticket'
  | 'add-to-watchlist'
  | 'manage-tags'
  | 'bulk-refine'
  | 'configure-lanes'
  | 'go-to-board'
  | 'go-to-watchlist'
  | 'go-to-explain'
  | 'refresh'
  | 'toggle-only-workspace'

export type GlobalCommandDescriptor = {
  readonly id: CommandId
  readonly label: string
  /** Extra searchable words, so a command is findable by its obvious name. */
  readonly synonyms: readonly string[]
}

export type GlobalCommandContext = {
  /** Which surface the palette was opened on — not necessarily a board. */
  readonly variant: ShellVariant
  /** What is typed into the palette right now — the filter command's argument. */
  readonly query: string
  /** The filter currently applied to this board; `''` for none. */
  readonly filter: string
  readonly onlyWorkspace: boolean
  /** Targets with a live opener on the command bus. */
  readonly registered: readonly CommandTarget[]
}

/** Which bus target a command opens, for the five that open a header modal. */
export const COMMAND_TARGETS: Partial<Record<CommandId, CommandTarget>> = {
  'new-ticket': 'new-ticket',
  'add-to-watchlist': 'add-to-watchlist',
  'manage-tags': 'manage-tags',
  'bulk-refine': 'bulk-refine',
  'configure-lanes': 'configure-lanes',
}

export function globalCommands(context: GlobalCommandContext): readonly GlobalCommandDescriptor[] {
  const commands: GlobalCommandDescriptor[] = []

  // The five header modals, each legal only while its button is mounted and has
  // registered an opener. An unregistered target is **not offered** rather than
  // offered-and-inert: `Configure lanes` exists on `/watchlist` alone, and the
  // honest answer on `/` is that the command is not available here.
  for (const modal of MODAL_COMMANDS) {
    const target = COMMAND_TARGETS[modal.id]
    if (target !== undefined && context.registered.includes(target)) commands.push(modal)
  }

  // Surface navigation: the surface you are already on is left out rather than
  // offered as a no-op.
  if (context.variant !== 'main') {
    commands.push({ id: 'go-to-board', label: 'Go to Board', synonyms: ['main', 'switch'] })
  }
  if (context.variant !== 'watchlist') {
    commands.push({
      id: 'go-to-watchlist',
      label: 'Go to Watchlist',
      synonyms: ['advise', 'switch'],
    })
  }
  if (context.variant !== 'explain') {
    commands.push({
      id: 'go-to-explain',
      label: 'Go to Explain',
      synonyms: ['review', 'mr', 'merge request', 'switch'],
    })
  }

  commands.push({ id: 'refresh', label: 'Refresh', synonyms: ['reload', 'sync'] })

  // Main-board only, for the same reason the header omits it on the watchlist:
  // workspace focus is a main-board concern (ADR-0007).
  if (context.variant === 'main') {
    commands.push({
      id: 'toggle-only-workspace',
      // The label reflects the current state, so the command says what it will do.
      label: context.onlyWorkspace
        ? 'Show all tickets (Only Workspace is on)'
        : 'Show only tickets with an open workspace',
      synonyms: ['workspace', 'worktree', 'cmux', 'filter'],
    })
  }

  // The board filter goes **last**, for a reason worth keeping: its label embeds
  // whatever was typed, so it matches every query and would otherwise always be
  // the first command offered. Typing "go to watchlist" and pressing ↵ would
  // then filter the board instead of switching to it. It is the fallback — "none
  // of the above, narrow the board instead" — so it belongs at the bottom.
  //
  // Both are board-only: Explain has no card grid to narrow, so offering to
  // filter it would be offering to do nothing.
  const trimmed = context.query.trim()
  if (context.variant === 'explain') return commands
  if (trimmed !== '' && trimmed !== context.filter) {
    commands.push({
      id: 'filter-board',
      label: `Filter board by '${trimmed}'`,
      synonyms: ['narrow', 'search'],
    })
  }
  if (context.filter !== '') {
    commands.push({
      id: 'clear-board-filter',
      label: `Clear board filter '${context.filter}'`,
      synonyms: ['reset', 'unfilter', 'show all'],
    })
  }

  return commands
}

const MODAL_COMMANDS: readonly GlobalCommandDescriptor[] = [
  { id: 'new-ticket', label: 'New Ticket', synonyms: ['create', 'add', 'quick create'] },
  {
    id: 'add-to-watchlist',
    label: 'Add to Watchlist…',
    synonyms: ['watch', 'advise', 'search ticket'],
  },
  { id: 'manage-tags', label: 'Manage Tags…', synonyms: ['tag', 'label', 'colour', 'color'] },
  { id: 'bulk-refine', label: 'Bulk Refine…', synonyms: ['transcript', 'meeting', 'notes', 'ai'] },
  { id: 'configure-lanes', label: 'Configure Lanes…', synonyms: ['swimlane', 'lane', 'columns'] },
]
