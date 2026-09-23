import { match } from 'ts-pattern'
import {
  REVIEW_BUCKET_STATUS_NAME,
  workItemId,
  workItemJiraKey,
  workItemTitle,
  type WorkItem,
} from '~/kernel'
import {
  PALETTE_SECTION_LABEL,
  PALETTE_SECTION_ORDER,
  paletteSection,
  rankCommands,
  rankItems,
  type PaletteCommand,
  type PaletteSection,
  type PaletteSourceNote,
} from '../domain'

// Framework-free state machine for the palette. The status *is* the navigation
// level, and each deeper level carries the shallower one's fields — so backing
// out of a level restoring the query and the selected result is structural
// rather than something the reducer has to remember. Later slices add the
// `actions` and `sub-list` statuses on top of `open`.
export type PaletteState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly query: string; readonly selected: number }

export type PaletteEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'closed' }
  | { readonly type: 'queryChanged'; readonly query: string }
  | { readonly type: 'moved'; readonly delta: number; readonly count: number }
  | { readonly type: 'highlighted'; readonly index: number }

export const initialPaletteState: PaletteState = { status: 'closed' }

// Wrap rather than clamp: a list you can run off the end of feels broken when
// the whole point is never touching the mouse.
function wrap(index: number, count: number): number {
  if (count <= 0) return 0
  return ((index % count) + count) % count
}

export function reducePalette(state: PaletteState, event: PaletteEvent): PaletteState {
  return (
    match([state, event] as const)
      .with([{ status: 'closed' }, { type: 'opened' }], () => ({
        status: 'open' as const,
        query: '',
        selected: 0,
      }))
      .with([{ status: 'open' }, { type: 'closed' }], () => initialPaletteState)
      // A fresh query means a fresh list, so the highlight goes back to the top.
      .with([{ status: 'open' }, { type: 'queryChanged' }], ([, e]) => ({
        status: 'open' as const,
        query: e.query,
        selected: 0,
      }))
      .with([{ status: 'open' }, { type: 'moved' }], ([s, e]) => ({
        ...s,
        selected: wrap(s.selected + e.delta, e.count),
      }))
      .with([{ status: 'open' }, { type: 'highlighted' }], ([s, e]) => ({
        ...s,
        selected: Math.max(0, e.index),
      }))
      // Events that do not apply to the current status are dropped, not errors:
      // a keypress can always race a close.
      .otherwise(() => state)
  )
}

/** A row's payload — a found work item, or a board-level command. */
export type PaletteRowTarget =
  | { readonly kind: 'item'; readonly item: WorkItem }
  | { readonly kind: 'command'; readonly command: PaletteCommand }

export type PaletteRow = {
  readonly id: string
  /** Absolute position in the flat list, which is what `selected` indexes. */
  readonly index: number
  readonly section: PaletteSection
  readonly badge: string | null
  readonly title: string
  readonly meta: string | null
  readonly enabled: boolean
  readonly target: PaletteRowTarget
}

export type PaletteSectionView = {
  readonly section: PaletteSection
  readonly label: string
  readonly rows: readonly PaletteRow[]
}

export type PaletteInputs = {
  readonly items: readonly WorkItem[]
  readonly commands: readonly PaletteCommand[]
  /**
   * Sources that are not contributing yet. The palette shows what it has and
   * says what is missing rather than blocking on the slowest source — a slow
   * GitLab call must not stop you finding an assigned ticket.
   */
  readonly sources: readonly PaletteSourceNote[]
}

export type PaletteDisplay =
  | { readonly status: 'closed' }
  | {
      readonly status: 'root'
      readonly query: string
      readonly sections: readonly PaletteSectionView[]
      readonly rowCount: number
      readonly selected: number
      readonly selectedRow: PaletteRow | null
      readonly sources: readonly PaletteSourceNote[]
    }

function itemBadge(item: WorkItem): string {
  return (
    workItemJiraKey(item) ??
    match(item)
      .with({ kind: 'review-fake' }, (i) => `MR !${i.card.iid}`)
      .otherwise(() => '')
  )
}

function itemMeta(item: WorkItem): string {
  return match(item)
    .with({ kind: 'jira' }, { kind: 'watchlist' }, (i) => i.issue.statusName)
    .with(
      { kind: 'review-real' },
      { kind: 'review-fake' },
      (i) => REVIEW_BUCKET_STATUS_NAME[i.card.bucket],
    )
    .exhaustive()
}

function itemRow(item: WorkItem, index: number): PaletteRow {
  return {
    id: workItemId(item),
    index,
    section: paletteSection(item),
    badge: itemBadge(item),
    title: workItemTitle(item),
    meta: itemMeta(item),
    enabled: true,
    target: { kind: 'item', item },
  }
}

function commandRow(command: PaletteCommand, index: number): PaletteRow {
  return {
    id: `command:${command.id}`,
    index,
    section: 'commands',
    badge: null,
    title: command.label,
    meta: null,
    enabled: command.enabled,
    target: { kind: 'command', command },
  }
}

function groupRows(rows: readonly PaletteRow[]): readonly PaletteSectionView[] {
  return PALETTE_SECTION_ORDER.map((section) => ({
    section,
    label: PALETTE_SECTION_LABEL[section],
    rows: rows.filter((row) => row.section === section),
  })).filter((view) => view.rows.length > 0)
}

// Rows are laid out section by section so the flat index the keyboard walks and
// the visual order agree — otherwise ↓ would appear to jump around.
function buildRows(inputs: PaletteInputs, query: string): readonly PaletteRow[] {
  const ranked = rankItems(inputs.items, query)
  const bySection = PALETTE_SECTION_ORDER.flatMap((section) =>
    section === 'commands' ? [] : ranked.filter((item) => paletteSection(item) === section),
  )
  const commands = rankCommands(inputs.commands, query).filter((command) => command.enabled)
  return [
    ...bySection.map((item, index) => itemRow(item, index)),
    ...commands.map((command, index) => commandRow(command, bySection.length + index)),
  ]
}

/** The query at any level — `''` while closed. */
export function paletteQuery(state: PaletteState): string {
  return match(state)
    .with({ status: 'closed' }, () => '')
    .with({ status: 'open' }, (s) => s.query)
    .exhaustive()
}

export function derivePalette(state: PaletteState, inputs: PaletteInputs): PaletteDisplay {
  return match(state)
    .with({ status: 'closed' }, () => ({ status: 'closed' as const }))
    .with({ status: 'open' }, (s) => {
      const rows = buildRows(inputs, s.query)
      // Clamped at derive time rather than in the reducer: the list shrinks
      // under the highlight whenever a source finishes loading or a mutation
      // lands, and the reducer has no idea how long the list is.
      const selected = rows.length === 0 ? 0 : Math.min(s.selected, rows.length - 1)
      return {
        status: 'root' as const,
        query: s.query,
        sections: groupRows(rows),
        rowCount: rows.length,
        selected,
        selectedRow: rows[selected] ?? null,
        sources: inputs.sources,
      }
    })
    .exhaustive()
}
