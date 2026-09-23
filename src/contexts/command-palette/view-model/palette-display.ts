import { match } from 'ts-pattern'
import {
  ACTION_GROUPS,
  ACTION_GROUP_LABEL,
  ACTION_GROUP_ORDER,
  ACTION_LABELS,
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
  type PaletteActionPerform,
  type PaletteCommand,
  type PaletteSection,
  type PaletteSourceNote,
  type PaletteSubItem,
  type PaletteSubList,
  type PaletteSubListSource,
  type SubListKind,
} from '../domain'
import type { PaletteState } from './palette-state'

// The pure projection from state + injected data to what the view renders. The
// state machine itself lives in `palette-state.ts`; nothing here mutates.

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
  readonly perform: PaletteActionPerform
}

export type PaletteSubItemRow = PaletteSubItem & {
  readonly index: number
  /** `1`–`9` for the first nine rows, `null` beyond — see `palette-key-intent`. */
  readonly digit: string | null
}

export type PaletteHelpRow = {
  readonly kind: ActionKind
  readonly label: string
  readonly shortcut: string
}

export type PaletteHelpGroupView = {
  readonly group: ActionGroup
  readonly label: string
  readonly rows: readonly PaletteHelpRow[]
}

export type PaletteSubListContent =
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly message: string }
  | { readonly state: 'ready'; readonly rows: readonly PaletteSubItemRow[] }

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
  /** The injected contents of a nested list, read only for the one that is open. */
  readonly subListFor: PaletteSubListSource
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
  | {
      readonly status: 'sub-list'
      readonly query: string
      readonly item: WorkItem
      readonly itemBadge: string | null
      readonly itemTitle: string
      readonly subList: SubListKind
      readonly title: string
      readonly content: PaletteSubListContent
      readonly rowCount: number
      readonly subIndex: number
      readonly selectedRow: PaletteSubItemRow | null
      /**
       * Whether running a row leaves the list open. The tag list does — several
       * tags usually get set in one visit — where the main action list and the
       * transition list both close on success. An intentional difference.
       */
      readonly staysOpen: boolean
    }
  | {
      readonly status: 'help'
      readonly groups: readonly PaletteHelpGroupView[]
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
        perform: action.perform,
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

const SUB_LIST_TITLE: Record<SubListKind, string> = {
  status: 'Change Status',
  tags: 'Tags',
}

function subItemRows(items: readonly PaletteSubItem[]): readonly PaletteSubItemRow[] {
  return items.map((item, index) => ({
    ...item,
    index,
    digit: index < 9 ? String(index + 1) : null,
  }))
}

function subListContent(list: PaletteSubList): PaletteSubListContent {
  return (
    match(list)
      .with({ kind: 'status', state: 'loading' }, () => ({ state: 'loading' as const }))
      .with({ kind: 'status', state: 'failed' }, (l) => ({
        state: 'failed' as const,
        message: l.message,
      }))
      .with({ kind: 'status', state: 'ready' }, (l) => ({
        state: 'ready' as const,
        rows: subItemRows(l.items),
      }))
      // Tags are already in the cache, so there is no loading arm to forget.
      .with({ kind: 'tags' }, (l) => ({ state: 'ready' as const, rows: subItemRows(l.items) }))
      .exhaustive()
  )
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

function findItem(state: { itemId: string }, inputs: PaletteInputs): WorkItem | undefined {
  return inputs.items.find((candidate) => workItemId(candidate) === state.itemId)
}

/**
 * The shortcut reference, **generated** from `kernel/commands.ts` rather than
 * hand-written beside it. A hand-written table would rot on the first action
 * added; this one cannot disagree with the map it is built from.
 */
export function deriveHelpGroups(): readonly PaletteHelpGroupView[] {
  const kinds = Object.keys(ACTION_SHORTCUTS) as ActionKind[]
  return ACTION_GROUP_ORDER.map((group) => ({
    group,
    label: ACTION_GROUP_LABEL[group],
    rows: kinds
      .filter((kind) => ACTION_GROUPS[kind] === group)
      .map((kind) => ({ kind, label: ACTION_LABELS[kind], shortcut: ACTION_SHORTCUTS[kind] })),
  })).filter((view) => view.rows.length > 0)
}

export function derivePalette(state: PaletteState, inputs: PaletteInputs): PaletteDisplay {
  return match(state)
    .with({ status: 'closed' }, () => ({ status: 'closed' as const }))
    .with({ status: 'open' }, (s) => deriveRoot(s, inputs))
    .with({ status: 'actions' }, (s) => {
      const item = findItem(s, inputs)
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
    .with({ status: 'help' }, () => ({
      status: 'help' as const,
      groups: deriveHelpGroups(),
    }))
    .with({ status: 'sub-list' }, (s) => {
      const item = findItem(s, inputs)
      if (item === undefined) {
        return deriveRoot({ status: 'open', query: s.query, selected: s.selected }, inputs)
      }
      const content = subListContent(inputs.subListFor(item, s.subList))
      const rows = content.state === 'ready' ? content.rows : []
      const subIndex = rows.length === 0 ? 0 : Math.min(s.subIndex, rows.length - 1)
      return {
        status: 'sub-list' as const,
        query: s.query,
        item,
        itemBadge: itemBadge(item),
        itemTitle: workItemTitle(item),
        subList: s.subList,
        title: SUB_LIST_TITLE[s.subList],
        content,
        rowCount: rows.length,
        subIndex,
        selectedRow: rows[subIndex] ?? null,
        staysOpen: s.subList === 'tags',
      }
    })
    .exhaustive()
}
