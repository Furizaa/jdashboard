import { match } from 'ts-pattern'
import type { ActionKind, WorkItem } from '~/kernel'

// The palette consumes **plain descriptors** and knows nothing about any other
// bounded context (ADR-0008). Everything effectful — the mutation, the
// navigation, the clipboard write — is closed over inside `run`, assembled in
// `routes/-command-palette/` where touching every context is legal.

/**
 * What choosing an action does. Two actions open a **nested list** instead of
 * running — status transitions and tags — and saying so in the descriptor is
 * what keeps the palette generic: it matches this shape exhaustively rather
 * than knowing which `ActionKind`s happen to be sub-lists. (The PRD sketched a
 * bare `run: () => void`; a callback that secretly navigates instead of acting
 * would have been a callback that lies.)
 */
export type PaletteActionPerform =
  | { readonly effect: 'run'; readonly run: () => void }
  | { readonly effect: 'sub-list'; readonly subList: SubListKind }

/** One action legal for one work item. `kind` is matched exhaustively. */
export type PaletteAction = {
  readonly kind: ActionKind
  readonly label: string
  /**
   * Whether the action can run *right now*. Illegal actions are omitted from
   * the list entirely rather than rendered disabled; `enabled: false` is for the
   * transient case — an action that exists but whose data is still loading.
   */
  readonly enabled: boolean
  readonly perform: PaletteActionPerform
}

/** The two actions that open a nested list rather than running. */
export type SubListKind = 'status' | 'tags'

/** One row in a nested list: a transition to pick, or a tag to toggle. */
export type PaletteSubItem = {
  readonly id: string
  readonly label: string
  /** Attached state, for a toggle list. `undefined` where the list is a pick. */
  readonly checked?: boolean
  /** A tag's own colour, so the row matches the chip on the card and in the panel. */
  readonly swatch?: { readonly bg: string; readonly fg: string }
  readonly run: () => void
}

/**
 * A nested list's contents.
 *
 * **Only `status` is asynchronous** — transitions come from Jira per ticket — so
 * only it has loading and failed arms. Tag data is already in the cache, and
 * forcing a shared shape would mean pretending a tag list can be "loading".
 * A failed transition fetch must look different from "this ticket has no
 * transitions": one is a broken request, the other is a fact about the ticket.
 */
export type PaletteSubList =
  | { readonly kind: 'status'; readonly state: 'loading' }
  | { readonly kind: 'status'; readonly state: 'failed'; readonly message: string }
  | { readonly kind: 'status'; readonly state: 'ready'; readonly items: readonly PaletteSubItem[] }
  | { readonly kind: 'tags'; readonly items: readonly PaletteSubItem[] }

/** The injected source of a nested list's contents. */
export type PaletteSubListSource = (item: WorkItem, kind: SubListKind) => PaletteSubList

/** A board-level command, belonging to no work item. */
export type PaletteCommand = {
  readonly id: string
  readonly label: string
  /** Extra searchable words ("create" finds "New Ticket"). Never rendered. */
  readonly synonyms?: readonly string[]
  readonly enabled: boolean
  readonly run: () => void
}

/**
 * Commands depend on what is typed — "Filter board by '‹query›'" interpolates it —
 * so the palette receives a function of the query rather than a fixed list. The
 * per-item mirror of this is the action catalogue, `(item) => PaletteAction[]`.
 */
export type PaletteCommandSource = (query: string) => readonly PaletteCommand[]

/**
 * What one of the palette's three sources is currently doing. A source that has
 * not arrived and a source that failed are different claims about an empty
 * result list, and conflating them is how a GitLab 401 turns into "still
 * loading" forever.
 */
export type PaletteSourceNote = {
  readonly source: string
  readonly state: 'loading' | 'unavailable'
}

/** Root-level result sections, in render order. */
export type PaletteSection = 'assigned' | 'watchlist' | 'review' | 'commands'

export const PALETTE_SECTION_ORDER: readonly PaletteSection[] = [
  'assigned',
  'watchlist',
  'review',
  'commands',
] as const

export const PALETTE_SECTION_LABEL: Record<PaletteSection, string> = {
  assigned: 'Assigned to me',
  watchlist: 'Watchlist',
  review: 'Review',
  commands: 'Commands',
}

/**
 * Which section a work item lands in. Grouping by source is what makes it
 * obvious whether a hit is assigned work, something you only advise on, or an
 * MR waiting on your review.
 */
export function paletteSection(item: WorkItem): PaletteSection {
  return match(item)
    .with({ kind: 'jira' }, () => 'assigned' as const)
    .with({ kind: 'watchlist' }, () => 'watchlist' as const)
    .with({ kind: 'review-real' }, { kind: 'review-fake' }, () => 'review' as const)
    .exhaustive()
}
