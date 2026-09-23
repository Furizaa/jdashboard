import { match } from 'ts-pattern'
import {
  ACTION_GROUPS,
  ACTION_GROUP_LABEL,
  ACTION_GROUP_ORDER,
  ACTION_SHORTCUTS,
  REVIEW_BUCKET_STATUS_NAME,
  workItemId,
  workItemJiraKey,
  workItemTitle,
  type ActionGroup,
  type ActionKind,
  type WorkItem,
} from '~/kernel'
import {
  PALETTE_SECTION_LABEL,
  PALETTE_SECTION_ORDER,
  paletteSection,
  rankCommands,
  rankItems,
  type PaletteAction,
  type PaletteCommand,
  type PaletteSection,
  type PaletteSourceNote,
} from '../domain'

// Framework-free state machine for the palette. The status *is* the navigation
// level, and each deeper level carries the shallower one's fields — so backing
// out of a level restoring the query and the selected result is structural
// rather than something the reducer has to remember.
export type PaletteState =
  | { readonly status: 'closed' }
  | { readonly status: 'open'; readonly query: string; readonly selected: number }
  | {
      readonly status: 'actions'
      readonly query: string
      readonly selected: number
      /**
       * Which item's actions — by `workItemId`, not by index, so a board refresh
       * that reorders the list cannot silently retarget the action.
       */
      readonly itemId: string
      readonly actionIndex: number
    }

export type PaletteEvent =
  | { readonly type: 'opened' }
  | { readonly type: 'closed' }
  | { readonly type: 'queryChanged'; readonly query: string }
  | { readonly type: 'moved'; readonly delta: number; readonly count: number }
  | { readonly type: 'highlighted'; readonly index: number }
  | { readonly type: 'enteredActions'; readonly itemId: string }
  | { readonly type: 'wentBack' }

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
      // Closing resets to the top from any depth. Escape is the one gesture that
      // does not care how deep you are — `wentBack` is the one that does.
      .with([{ status: 'open' }, { type: 'closed' }], () => initialPaletteState)
      .with([{ status: 'actions' }, { type: 'closed' }], () => initialPaletteState)
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
      .with([{ status: 'actions' }, { type: 'moved' }], ([s, e]) => ({
        ...s,
        actionIndex: wrap(s.actionIndex + e.delta, e.count),
      }))
      .with([{ status: 'open' }, { type: 'highlighted' }], ([s, e]) => ({
        ...s,
        selected: Math.max(0, e.index),
      }))
      .with([{ status: 'actions' }, { type: 'highlighted' }], ([s, e]) => ({
        ...s,
        actionIndex: Math.max(0, e.index),
      }))
      .with([{ status: 'open' }, { type: 'enteredActions' }], ([s, e]) => ({
        status: 'actions' as const,
        query: s.query,
        selected: s.selected,
        itemId: e.itemId,
        actionIndex: 0,
      }))
      // Popping a level keeps `query` and `selected`, so stepping in and out of an
      // item is lossless. Losing your query because you backed out of an action
      // list would be infuriating.
      .with([{ status: 'actions' }, { type: 'wentBack' }], ([s]) => ({
        status: 'open' as const,
        query: s.query,
        selected: s.selected,
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

export type PaletteActionRow = {
  readonly kind: ActionKind
  readonly index: number
  readonly label: string
  readonly shortcut: string
  readonly enabled: boolean
  readonly run: () => void
}

export type PaletteActionGroupView = {
  readonly group: ActionGroup
  readonly label: string
  readonly rows: readonly PaletteActionRow[]
}

export type PaletteInputs = {
  readonly items: readonly WorkItem[]
  readonly commands: readonly PaletteCommand[]
  /**
   * The injected action catalogue. It returns only the actions **legal** for the
   * item — illegal ones are absent, not disabled — so the view-model orders and
   * groups without judging legality itself.
   */
  readonly actionsFor: (item: WorkItem) => readonly PaletteAction[]
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
  | {
      readonly status: 'actions'
      readonly query: string
      readonly item: WorkItem
      readonly itemBadge: string | null
      readonly itemTitle: string
      readonly groups: readonly PaletteActionGroupView[]
      readonly actionCount: number
      readonly actionIndex: number
      readonly selectedAction: PaletteActionRow | null
      /** Shortcut dispatch: a letter resolves to an action kind, then to this. */
      readonly byKind: ReadonlyMap<ActionKind, PaletteActionRow>
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

// Grouped in `ACTION_GROUP_ORDER`, keeping the catalogue's order inside a group,
// then numbered — the same contract as the root rows, so the keyboard index and
// the visual order agree here too.
function buildActionRows(actions: readonly PaletteAction[]): readonly PaletteActionRow[] {
  const rows: PaletteActionRow[] = []
  for (const group of ACTION_GROUP_ORDER) {
    for (const action of actions) {
      if (ACTION_GROUPS[action.kind] !== group) continue
      rows.push({
        kind: action.kind,
        index: rows.length,
        label: action.label,
        shortcut: ACTION_SHORTCUTS[action.kind],
        enabled: action.enabled,
        run: action.run,
      })
    }
  }
  return rows
}

function groupActionRows(rows: readonly PaletteActionRow[]): readonly PaletteActionGroupView[] {
  return ACTION_GROUP_ORDER.map((group) => ({
    group,
    label: ACTION_GROUP_LABEL[group],
    rows: rows.filter((row) => ACTION_GROUPS[row.kind] === group),
  })).filter((view) => view.rows.length > 0)
}

/** The query at any level — `''` while closed. */
export function paletteQuery(state: PaletteState): string {
  return match(state)
    .with({ status: 'closed' }, () => '')
    .with({ status: 'open' }, { status: 'actions' }, (s) => s.query)
    .exhaustive()
}

function deriveRoot(
  s: Extract<PaletteState, { status: 'open' }>,
  inputs: PaletteInputs,
): Extract<PaletteDisplay, { status: 'root' }> {
  const rows = buildRows(inputs, s.query)
  // Clamped at derive time rather than in the reducer: the list shrinks under
  // the highlight whenever a source finishes loading or a mutation lands, and
  // the reducer has no idea how long the list is.
  const selected = rows.length === 0 ? 0 : Math.min(s.selected, rows.length - 1)
  return {
    status: 'root',
    query: s.query,
    sections: groupRows(rows),
    rowCount: rows.length,
    selected,
    selectedRow: rows[selected] ?? null,
    sources: inputs.sources,
  }
}

export function derivePalette(state: PaletteState, inputs: PaletteInputs): PaletteDisplay {
  return match(state)
    .with({ status: 'closed' }, () => ({ status: 'closed' as const }))
    .with({ status: 'open' }, (s) => deriveRoot(s, inputs))
    .with({ status: 'actions' }, (s) => {
      const item = inputs.items.find((candidate) => workItemId(candidate) === s.itemId)
      // The item can vanish under us — a board refresh drops a Done ticket, a
      // watchlist removal lands. Falling back to the results list is honest;
      // rendering an action list for nothing is not.
      if (item === undefined) {
        return deriveRoot({ status: 'open', query: s.query, selected: s.selected }, inputs)
      }
      const rows = buildActionRows(inputs.actionsFor(item))
      const actionIndex = rows.length === 0 ? 0 : Math.min(s.actionIndex, rows.length - 1)
      return {
        status: 'actions' as const,
        query: s.query,
        item,
        itemBadge: itemBadge(item),
        itemTitle: workItemTitle(item),
        groups: groupActionRows(rows),
        actionCount: rows.length,
        actionIndex,
        selectedAction: rows[actionIndex] ?? null,
        byKind: new Map(rows.map((row) => [row.kind, row])),
      }
    })
    .exhaustive()
}
