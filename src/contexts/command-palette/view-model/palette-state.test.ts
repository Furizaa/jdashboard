import { describe, expect, it } from 'vitest'
import type { WorkItem } from '~/kernel'
import type { PaletteAction, PaletteCommand, PaletteSubItem, PaletteSubList } from '../domain'
import {
  derivePalette,
  initialPaletteState,
  paletteActiveItemId,
  paletteQuery,
  reducePalette,
  type PaletteInputs,
  type PaletteState,
} from '.'

function jira(key: string, summary: string): WorkItem {
  return {
    kind: 'jira',
    issue: { key, summary, statusName: 'Reviewed', typeName: 'Task', labels: [], epic: null },
  }
}

function watched(key: string, summary: string): WorkItem {
  return {
    kind: 'watchlist',
    issue: {
      key,
      summary,
      statusName: 'In Implementation',
      typeName: 'Task',
      labels: [],
      epic: null,
    },
  }
}

function fake(iid: number, title: string): WorkItem {
  return {
    kind: 'review-fake',
    card: {
      kind: 'review-fake',
      iid,
      webUrl: `https://gitlab.example/mr/${iid}`,
      title,
      bucket: 'needs-review',
      mrState: 'opened',
      reviewers: [],
      unresolvedCount: 0,
      ciState: 'none',
      priority: null,
      jiraKeyAttempted: null,
    },
  }
}

const command = (id: string, label: string, enabled = true): PaletteCommand => ({
  id,
  label,
  enabled,
  run: () => {},
})

const ITEMS: readonly WorkItem[] = [
  jira('HDR-1', 'Assigned one'),
  watched('HDR-2', 'Watched two'),
  fake(77, 'Bump deps'),
]

const action = (kind: PaletteAction['kind'], label = kind, enabled = true): PaletteAction => ({
  kind,
  label,
  enabled,
  perform: { effect: 'run', run: () => {} },
})

function inputs(overrides: Partial<PaletteInputs> = {}): PaletteInputs {
  return {
    items: ITEMS,
    commands: [],
    sources: [],
    actionsFor: () => [],
    subListFor: () => ({ kind: 'tags', items: [] }),
    ...overrides,
  }
}

const open = (query = '', selected = 0): PaletteState => ({ status: 'open', query, selected })

const actions = (itemId: string, query = '', selected = 0, actionIndex = 0): PaletteState => ({
  status: 'actions',
  query,
  selected,
  itemId,
  actionIndex,
})

const subList = (
  itemId: string,
  kind: 'status' | 'tags',
  query = '',
  selected = 0,
  actionIndex = 0,
  subIndex = 0,
): PaletteState => ({
  status: 'sub-list',
  query,
  selected,
  itemId,
  actionIndex,
  subList: kind,
  subIndex,
})

const subItem = (id: string, label = id, checked?: boolean): PaletteSubItem => ({
  id,
  label,
  checked,
  run: () => {},
})

function root(state: PaletteState, given: PaletteInputs = inputs()) {
  const display = derivePalette(state, given)
  if (display.status !== 'root') throw new Error(`expected root, got ${display.status}`)
  return display
}

function actionsView(state: PaletteState, given: PaletteInputs) {
  const display = derivePalette(state, given)
  if (display.status !== 'actions') throw new Error(`expected actions, got ${display.status}`)
  return display
}

function subListView(state: PaletteState, given: PaletteInputs) {
  const display = derivePalette(state, given)
  if (display.status !== 'sub-list') throw new Error(`expected sub-list, got ${display.status}`)
  return display
}

describe('reducePalette', () => {
  it('starts closed and opens with an empty query at the top of the list', () => {
    expect(initialPaletteState).toEqual({ status: 'closed' })
    expect(reducePalette(initialPaletteState, { type: 'opened' })).toEqual(open())
  })

  it('closes back to the initial state, discarding the query', () => {
    expect(reducePalette(open('hdr', 2), { type: 'closed' })).toEqual({ status: 'closed' })
  })

  it('resets the highlight to the top when the query changes', () => {
    expect(reducePalette(open('hdr', 2), { type: 'queryChanged', query: 'hdr-1' })).toEqual(
      open('hdr-1'),
    )
  })

  it('wraps the highlight at both ends rather than sticking', () => {
    expect(reducePalette(open('', 2), { type: 'moved', delta: 1, count: 3 })).toEqual(open('', 0))
    expect(reducePalette(open('', 0), { type: 'moved', delta: -1, count: 3 })).toEqual(open('', 2))
  })

  it('treats a move in an empty list as a no-op rather than dividing by zero', () => {
    expect(reducePalette(open(), { type: 'moved', delta: 1, count: 0 })).toEqual(open('', 0))
  })

  it('highlights an explicit index, never a negative one', () => {
    expect(reducePalette(open(), { type: 'highlighted', index: 2 })).toEqual(open('', 2))
    expect(reducePalette(open(), { type: 'highlighted', index: -1 })).toEqual(open('', 0))
  })

  it('drops events that do not apply to the current status', () => {
    // A keypress can always race a close; that is not an error.
    const closed = initialPaletteState
    expect(reducePalette(closed, { type: 'moved', delta: 1, count: 3 })).toBe(closed)
    expect(reducePalette(closed, { type: 'queryChanged', query: 'x' })).toBe(closed)
    const opened = open()
    expect(reducePalette(opened, { type: 'opened' })).toBe(opened)
  })
})

describe('paletteQuery', () => {
  it('is the open query, and empty while closed', () => {
    expect(paletteQuery(initialPaletteState)).toBe('')
    expect(paletteQuery(open('hdr'))).toBe('hdr')
  })
})

describe('derivePalette', () => {
  it('renders nothing while closed', () => {
    expect(derivePalette(initialPaletteState, inputs())).toEqual({ status: 'closed' })
  })

  it('groups rows by source in a fixed order', () => {
    const display = root(open())
    expect(display.sections.map((s) => s.section)).toEqual(['assigned', 'watchlist', 'review'])
    expect(display.sections.map((s) => s.label)).toEqual(['Assigned to me', 'Watchlist', 'Review'])
  })

  it('numbers rows so the flat index the keyboard walks matches the visual order', () => {
    const display = root(open())
    const indices = display.sections.flatMap((s) => s.rows.map((r) => r.index))
    expect(indices).toEqual([0, 1, 2])
    expect(display.rowCount).toBe(3)
  })

  it('labels a row with its key, title and status', () => {
    const [row] = root(open()).sections[0]?.rows ?? []
    expect(row).toMatchObject({ badge: 'HDR-1', title: 'Assigned one', meta: 'Reviewed' })
  })

  it('labels a fake review card with its MR number and review bucket', () => {
    const reviewSection = root(open()).sections.find((s) => s.section === 'review')
    expect(reviewSection?.rows[0]).toMatchObject({
      badge: 'MR !77',
      title: 'Bump deps',
      meta: 'Needs Review',
    })
  })

  it('narrows to matching items as the query is typed', () => {
    const display = root(open('watched'))
    expect(display.rowCount).toBe(1)
    expect(display.selectedRow?.title).toBe('Watched two')
  })

  it('omits an empty section entirely rather than rendering a bare header', () => {
    expect(root(open('watched')).sections.map((s) => s.section)).toEqual(['watchlist'])
  })

  it('appends matching commands in their own section, after the work items', () => {
    const display = root(
      open('filter'),
      inputs({ commands: [command('filter-board', "Filter board by 'filter'")] }),
    )
    expect(display.sections.map((s) => s.section)).toEqual(['commands'])
    expect(display.selectedRow?.target).toMatchObject({ kind: 'command' })
  })

  it('leaves disabled commands out of the list', () => {
    const display = root(open(), inputs({ commands: [command('nope', 'Nope', false)] }))
    expect(display.sections.some((s) => s.section === 'commands')).toBe(false)
  })

  it('clamps a highlight that the list shrank out from under', () => {
    const display = root(open('watched', 2))
    expect(display.selected).toBe(0)
    expect(display.selectedRow?.title).toBe('Watched two')
  })

  it('has no selected row when nothing matches', () => {
    const display = root(open('nothing-matches-this'))
    expect(display.rowCount).toBe(0)
    expect(display.selectedRow).toBeNull()
    expect(display.sections).toEqual([])
  })

  it('passes source notes straight through so the footer can be honest', () => {
    const sources = [{ source: 'Review cards', state: 'loading' as const }]
    expect(root(open(), inputs({ sources })).sources).toBe(sources)
  })
})

describe('the results ↔ actions transitions', () => {
  it("enters an item's action list, keeping the query and the selected result", () => {
    const entered = reducePalette(open('hdr', 1), { type: 'enteredActions', itemId: 'HDR-2' })
    expect(entered).toEqual(actions('HDR-2', 'hdr', 1, 0))
  })

  it('pops back to the results with the query and the selected result intact', () => {
    const popped = reducePalette(actions('HDR-2', 'hdr', 1, 3), { type: 'wentBack' })
    expect(popped).toEqual(open('hdr', 1))
  })

  it('moves the action highlight, not the result highlight', () => {
    const moved = reducePalette(actions('HDR-2', 'hdr', 1, 0), {
      type: 'moved',
      delta: 1,
      count: 3,
    })
    expect(moved).toEqual(actions('HDR-2', 'hdr', 1, 1))
    expect(reducePalette(moved, { type: 'moved', delta: -1, count: 3 })).toEqual(
      actions('HDR-2', 'hdr', 1, 0),
    )
  })

  it('wraps the action highlight at both ends', () => {
    expect(
      reducePalette(actions('HDR-2', '', 0, 0), { type: 'moved', delta: -1, count: 3 }),
    ).toEqual(actions('HDR-2', '', 0, 2))
  })

  it('closes to the top from the action list, not back one level', () => {
    expect(reducePalette(actions('HDR-2', 'hdr', 1, 2), { type: 'closed' })).toEqual({
      status: 'closed',
    })
  })

  it('keeps the query visible at the action level', () => {
    expect(paletteQuery(actions('HDR-2', 'hdr'))).toBe('hdr')
  })
})

describe('derivePalette at the action level', () => {
  const catalogue = inputs({
    actionsFor: () => [
      action('copy-issue-key'),
      action('open-detail'),
      action('open-in-jira'),
      action('open-notes'),
    ],
  })

  it('names the item the actions belong to', () => {
    const display = actionsView(actions('HDR-1'), catalogue)
    expect(display.itemBadge).toBe('HDR-1')
    expect(display.itemTitle).toBe('Assigned one')
  })

  it('groups actions in the kernel group order, whatever order the catalogue gave', () => {
    const display = actionsView(actions('HDR-1'), catalogue)
    expect(display.groups.map((g) => g.group)).toEqual(['workflow', 'links'])
    expect(display.groups.flatMap((g) => g.rows.map((r) => r.kind))).toEqual([
      'open-detail',
      'open-notes',
      'copy-issue-key',
      'open-in-jira',
    ])
  })

  it('numbers actions so the keyboard index matches the visual order', () => {
    const display = actionsView(actions('HDR-1'), catalogue)
    expect(display.groups.flatMap((g) => g.rows.map((r) => r.index))).toEqual([0, 1, 2, 3])
    expect(display.actionCount).toBe(4)
  })

  it("prints each action's curated shortcut", () => {
    const display = actionsView(actions('HDR-1'), catalogue)
    const shortcuts = new Map(
      display.groups.flatMap((g) => g.rows).map((r) => [r.kind, r.shortcut]),
    )
    expect(shortcuts.get('open-detail')).toBe('d')
    expect(shortcuts.get('copy-issue-key')).toBe('y')
  })

  it('exposes a by-kind index so a letter can dispatch straight to an action', () => {
    const display = actionsView(actions('HDR-1'), catalogue)
    expect(display.byKind.get('open-notes')?.label).toBe('open-notes')
    expect(display.byKind.has('discard-workspace')).toBe(false)
  })

  it('offers exactly what the catalogue deems legal — a fake review card gets the MR pair', () => {
    const display = actionsView(
      actions('review:77'),
      inputs({ actionsFor: () => [action('open-mr'), action('review-mr')] }),
    )
    expect(display.groups.flatMap((g) => g.rows.map((r) => r.kind))).toEqual([
      'open-mr',
      'review-mr',
    ])
    expect(display.byKind.has('open-detail')).toBe(false)
    expect(display.byKind.has('change-status')).toBe(false)
  })

  it('says so rather than rendering an empty list when nothing is legal', () => {
    const display = actionsView(actions('HDR-1'), inputs({ actionsFor: () => [] }))
    expect(display.groups).toEqual([])
    expect(display.actionCount).toBe(0)
    expect(display.selectedAction).toBeNull()
  })

  it('clamps an action highlight that the list shrank out from under', () => {
    const display = actionsView(
      actions('HDR-1', '', 0, 9),
      inputs({ actionsFor: () => [action('open-detail')] }),
    )
    expect(display.actionIndex).toBe(0)
    expect(display.selectedAction?.kind).toBe('open-detail')
  })

  it('keeps a transiently-unrunnable action in the list, marked not enabled', () => {
    const display = actionsView(
      actions('HDR-1'),
      inputs({
        actionsFor: () => [
          {
            kind: 'change-status',
            label: 'Change Status…',
            enabled: false,
            perform: { effect: 'sub-list', subList: 'status' },
          },
        ],
      }),
    )
    expect(display.selectedAction?.enabled).toBe(false)
  })

  it('falls back to the results when the item vanishes under it', () => {
    // A board refresh drops a Done ticket, or a watchlist removal lands.
    const display = derivePalette(actions('HDR-GONE', 'assigned', 0), catalogue)
    expect(display.status).toBe('root')
  })
})

describe('the three-deep navigation stack', () => {
  it('steps results → actions → sub-list, each level keeping the last', () => {
    const atActions = reducePalette(open('hdr', 2), {
      type: 'enteredActions',
      itemId: 'HDR-2',
    })
    const atSubList = reducePalette(atActions, { type: 'enteredSubList', subList: 'status' })
    expect(atSubList).toEqual(subList('HDR-2', 'status', 'hdr', 2, 0, 0))
  })

  it('pops exactly one level per press, all the way back out', () => {
    const deep = subList('HDR-2', 'status', 'hdr', 2, 3, 5)
    const backToActions = reducePalette(deep, { type: 'wentBack' })
    expect(backToActions).toEqual(actions('HDR-2', 'hdr', 2, 3))
    const backToResults = reducePalette(backToActions, { type: 'wentBack' })
    expect(backToResults).toEqual(open('hdr', 2))
    // Root has nothing above it; another press changes nothing.
    expect(reducePalette(backToResults, { type: 'wentBack' })).toBe(backToResults)
  })

  it('closes the whole palette from the deepest level, not one step', () => {
    expect(reducePalette(subList('HDR-2', 'tags', 'hdr', 2, 3, 5), { type: 'closed' })).toEqual({
      status: 'closed',
    })
  })

  it('keeps the query readable from the deepest level', () => {
    expect(paletteQuery(subList('HDR-2', 'tags', 'hdr'))).toBe('hdr')
  })

  it('moves the sub-list highlight, leaving the two above it alone', () => {
    const moved = reducePalette(subList('HDR-2', 'status', 'hdr', 2, 3, 0), {
      type: 'moved',
      delta: 1,
      count: 3,
    })
    expect(moved).toEqual(subList('HDR-2', 'status', 'hdr', 2, 3, 1))
  })

  it('reports which item is active at the two deep levels and nothing at root', () => {
    expect(paletteActiveItemId(initialPaletteState)).toBeNull()
    expect(paletteActiveItemId(open('hdr', 1))).toBeNull()
    expect(paletteActiveItemId(actions('HDR-2'))).toBe('HDR-2')
    expect(paletteActiveItemId(subList('HDR-2', 'status'))).toBe('HDR-2')
  })
})

describe('derivePalette at a sub-list level', () => {
  const withStatus = (list: PaletteSubList) => inputs({ subListFor: () => list })

  it('names the item and the list, so the breadcrumb reads end to end', () => {
    const display = subListView(
      subList('HDR-1', 'status'),
      withStatus({ kind: 'status', state: 'ready', items: [subItem('11', 'In Code Review')] }),
    )
    expect(display.itemBadge).toBe('HDR-1')
    expect(display.itemTitle).toBe('Assigned one')
    expect(display.title).toBe('Change Status')
  })

  it('renders the loading arm while the transitions fetch is in flight', () => {
    const display = subListView(
      subList('HDR-1', 'status'),
      withStatus({ kind: 'status', state: 'loading' }),
    )
    expect(display.content).toEqual({ state: 'loading' })
    expect(display.rowCount).toBe(0)
    expect(display.selectedRow).toBeNull()
  })

  it('renders the failed arm with its message — not an empty list', () => {
    const display = subListView(
      subList('HDR-1', 'status'),
      withStatus({ kind: 'status', state: 'failed', message: 'Jira said no' }),
    )
    // A broken request and "no transitions exist" must not look the same.
    expect(display.content).toEqual({ state: 'failed', message: 'Jira said no' })
  })

  it('renders an empty ready list distinctly from both', () => {
    const display = subListView(
      subList('HDR-1', 'status'),
      withStatus({ kind: 'status', state: 'ready', items: [] }),
    )
    expect(display.content).toEqual({ state: 'ready', rows: [] })
  })

  it('numbers and digit-keys the first nine rows only', () => {
    const items = Array.from({ length: 11 }, (_, i) => subItem(`t${i}`))
    const display = subListView(
      subList('HDR-1', 'status'),
      withStatus({ kind: 'status', state: 'ready', items }),
    )
    if (display.content.state !== 'ready') throw new Error('expected ready')
    expect(display.content.rows.map((r) => r.digit)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      null,
      null,
    ])
    expect(display.content.rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('clamps a sub-list highlight that the list shrank out from under', () => {
    const display = subListView(
      subList('HDR-1', 'status', '', 0, 0, 9),
      withStatus({ kind: 'status', state: 'ready', items: [subItem('a')] }),
    )
    expect(display.subIndex).toBe(0)
    expect(display.selectedRow?.id).toBe('a')
  })

  it("carries each tag row's attached state and colour through untouched", () => {
    const display = subListView(
      subList('HDR-1', 'tags'),
      inputs({
        subListFor: () => ({
          kind: 'tags',
          items: [
            {
              id: 'red',
              label: 'Red',
              checked: true,
              swatch: { bg: '#f00', fg: '#fff' },
              run: () => {},
            },
            {
              id: 'blue',
              label: 'Blue',
              checked: false,
              swatch: { bg: '#00f', fg: '#fff' },
              run: () => {},
            },
          ],
        }),
      }),
    )
    expect(display.title).toBe('Tags')
    if (display.content.state !== 'ready') throw new Error('expected ready')
    expect(display.content.rows.map((r) => [r.id, r.checked])).toEqual([
      ['red', true],
      ['blue', false],
    ])
    expect(display.content.rows[0]?.swatch).toEqual({ bg: '#f00', fg: '#fff' })
  })

  it('keeps the tag list open after a toggle, and closes the transition list', () => {
    // Several tags usually get set in one visit; picking a status is the errand.
    expect(
      subListView(
        subList('HDR-1', 'tags'),
        inputs({ subListFor: () => ({ kind: 'tags', items: [] }) }),
      ).staysOpen,
    ).toBe(true)
    expect(
      subListView(subList('HDR-1', 'status'), withStatus({ kind: 'status', state: 'loading' }))
        .staysOpen,
    ).toBe(false)
  })

  it('falls back to the results when the item vanishes under it', () => {
    const display = derivePalette(subList('HDR-GONE', 'status', 'assigned'), inputs())
    expect(display.status).toBe('root')
  })
})
