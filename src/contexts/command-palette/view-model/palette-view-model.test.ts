import { describe, expect, it } from 'vitest'
import type { WorkItem } from '~/kernel'
import type { PaletteCommand } from '../domain'
import {
  derivePalette,
  initialPaletteState,
  paletteQuery,
  reducePalette,
  type PaletteInputs,
  type PaletteState,
} from './palette-view-model'

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

function inputs(overrides: Partial<PaletteInputs> = {}): PaletteInputs {
  return { items: ITEMS, commands: [], sources: [], ...overrides }
}

const open = (query = '', selected = 0): PaletteState => ({ status: 'open', query, selected })

function root(state: PaletteState, given: PaletteInputs = inputs()) {
  const display = derivePalette(state, given)
  if (display.status !== 'root') throw new Error(`expected root, got ${display.status}`)
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
