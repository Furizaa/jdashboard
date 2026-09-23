import { match } from 'ts-pattern'
import type { ActionKind, WorkItem } from '~/kernel'

// The palette consumes **plain descriptors** and knows nothing about any other
// bounded context (ADR-0008). Everything effectful — the mutation, the
// navigation, the clipboard write — is closed over inside `run`, assembled in
// `routes/-command-palette/` where touching every context is legal.

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
  readonly run: () => void
}

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
