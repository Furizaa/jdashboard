import { describe, expect, it } from 'vitest'
import type { CommandTarget } from '~/coordinator'
import { globalCommands, type CommandId, type GlobalCommandContext } from './global-commands'

const ALL_TARGETS: readonly CommandTarget[] = [
  'new-ticket',
  'add-to-watchlist',
  'manage-tags',
  'bulk-refine',
  'configure-lanes',
]

function context(overrides: Partial<GlobalCommandContext> = {}): GlobalCommandContext {
  return {
    variant: 'main',
    query: '',
    filter: '',
    onlyWorkspace: false,
    registered: ALL_TARGETS,
    ...overrides,
  }
}

const ids = (ctx: GlobalCommandContext): readonly CommandId[] =>
  globalCommands(ctx).map((c) => c.id)

const labelFor = (ctx: GlobalCommandContext, id: CommandId) =>
  globalCommands(ctx).find((c) => c.id === id)?.label

describe('the board-filter commands', () => {
  it('offers the filter command only once something is typed', () => {
    expect(ids(context())).not.toContain('filter-board')
    expect(ids(context({ query: 'apple' }))).toContain('filter-board')
  })

  it('interpolates what is typed, so the command matches its own query', () => {
    expect(labelFor(context({ query: '  apple  ' }), 'filter-board')).toBe(
      "Filter board by 'apple'",
    )
  })

  it('drops it once that exact filter is already applied', () => {
    expect(ids(context({ query: 'apple', filter: 'apple' }))).not.toContain('filter-board')
  })

  it('offers Clear only while a filter is applied, and names it', () => {
    expect(ids(context())).not.toContain('clear-board-filter')
    expect(labelFor(context({ filter: 'apple' }), 'clear-board-filter')).toBe(
      "Clear board filter 'apple'",
    )
  })

  it('ranks last, so a query that names a command does not filter the board instead', () => {
    // Its label embeds the query, so it matches *everything* — first place would
    // mean ↵ on "go to watchlist" narrowing the board rather than switching.
    const offered = ids(context({ query: 'go to watchlist' }))
    expect(offered.at(-1)).toBe('filter-board')
    expect(offered.indexOf('go-to-watchlist')).toBeLessThan(offered.indexOf('filter-board'))
  })
})

describe('the header-modal commands', () => {
  it('offers each one while its button has registered an opener', () => {
    const offered = ids(context({ variant: 'watchlist' }))
    for (const target of ALL_TARGETS) expect(offered).toContain(target)
  })

  it('withholds a command whose target is not registered', () => {
    // `Configure lanes` lives on `/watchlist` only, so on `/` there is no opener
    // — and the honest answer is that the command is not available here.
    const onMainBoard = ids(
      context({ registered: ALL_TARGETS.filter((t) => t !== 'configure-lanes') }),
    )
    expect(onMainBoard).not.toContain('configure-lanes')
    expect(onMainBoard).toContain('new-ticket')
  })

  it('withholds all of them before anything has registered', () => {
    const early = ids(context({ registered: [] }))
    for (const target of ALL_TARGETS) expect(early).not.toContain(target)
    // The commands that need no bus are still there.
    expect(early).toContain('refresh')
  })
})

describe('route-scoped legality', () => {
  it('offers Only Workspace on the main board alone', () => {
    expect(ids(context({ variant: 'main' }))).toContain('toggle-only-workspace')
    expect(ids(context({ variant: 'watchlist' }))).not.toContain('toggle-only-workspace')
  })

  it('reflects the current Only Workspace state in the label, so it says what it will do', () => {
    expect(labelFor(context({ onlyWorkspace: false }), 'toggle-only-workspace')).toMatch(
      /^Show only/u,
    )
    expect(labelFor(context({ onlyWorkspace: true }), 'toggle-only-workspace')).toMatch(
      /^Show all/u,
    )
  })

  it('leaves out the board you are already on rather than offering a no-op', () => {
    expect(ids(context({ variant: 'main' }))).toEqual(expect.arrayContaining(['go-to-watchlist']))
    expect(ids(context({ variant: 'main' }))).not.toContain('go-to-board')
    expect(ids(context({ variant: 'watchlist' }))).toContain('go-to-board')
    expect(ids(context({ variant: 'watchlist' }))).not.toContain('go-to-watchlist')
  })

  it('always offers Refresh — neither board can fail to honour it', () => {
    expect(ids(context({ variant: 'main' }))).toContain('refresh')
    expect(ids(context({ variant: 'watchlist' }))).toContain('refresh')
  })
})

describe('global command invariants', () => {
  const everyContext: readonly GlobalCommandContext[] = [
    context(),
    context({ variant: 'watchlist' }),
    context({ query: 'apple' }),
    context({ query: 'apple', filter: 'apple' }),
    context({ filter: 'pear', onlyWorkspace: true }),
    context({ registered: [] }),
    context({ variant: 'watchlist', registered: ['configure-lanes'] }),
  ]

  it('never offers the same command twice', () => {
    for (const ctx of everyContext) {
      const offered = ids(ctx)
      expect(new Set(offered).size).toBe(offered.length)
    }
  })

  it('gives every command a label and at least one synonym to be found by', () => {
    for (const ctx of everyContext) {
      for (const command of globalCommands(ctx)) {
        expect(command.label).not.toBe('')
        expect(command.synonyms.length).toBeGreaterThan(0)
      }
    }
  })
})
