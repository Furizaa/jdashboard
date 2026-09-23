import { describe, expect, it } from 'vitest'
import { workItemJiraKey, type WorkItem } from '~/kernel'
import type { PaletteCommand } from './palette-descriptors'
import { rankCommands, rankItems, splitTerms } from './rank-items'

function jira(key: string, summary: string): WorkItem {
  return {
    kind: 'jira',
    issue: { key, summary, statusName: 'Reviewed', typeName: 'Task', labels: [], epic: null },
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

const keys = (items: readonly WorkItem[]) => items.map((item) => workItemJiraKey(item) ?? 'mr')

describe('splitTerms', () => {
  it('splits on whitespace, lowercases, and drops empties', () => {
    expect(splitTerms('  Apple   PIE ')).toEqual(['apple', 'pie'])
    expect(splitTerms('   ')).toEqual([])
  })
})

describe('rankItems', () => {
  const items = [
    jira('HDR-100', 'Mentions HDR-501 in passing'),
    jira('HDR-501', 'Trajectory minimap'),
    jira('HDR-5010', 'Minimap follow-up'),
    jira('HDR-200', 'Apple pie'),
  ]

  it('returns everything untouched for an empty query', () => {
    expect(rankItems(items, '')).toBe(items)
    expect(rankItems(items, '   ')).toBe(items)
  })

  it('requires every term to match, case-insensitively', () => {
    expect(keys(rankItems(items, 'apple'))).toEqual(['HDR-200'])
    expect(keys(rankItems(items, 'APPLE PIE'))).toEqual(['HDR-200'])
    expect(rankItems(items, 'apple minimap')).toEqual([])
  })

  it('matches the key as well as the summary', () => {
    expect(keys(rankItems(items, 'hdr-200'))).toEqual(['HDR-200'])
  })

  it('ranks an exact key hit above a mid-summary substring hit', () => {
    // HDR-100 merely mentions HDR-501 in its summary; HDR-501 *is* it.
    expect(keys(rankItems(items, 'hdr-501'))).toEqual(['HDR-501', 'HDR-5010', 'HDR-100'])
  })

  it('ranks a key-prefix hit above a substring hit but below an exact one', () => {
    expect(keys(rankItems(items, 'hdr-50'))).toEqual(['HDR-501', 'HDR-5010', 'HDR-100'])
  })

  it('steers by the first term, so a refining second term does not lose the key rank', () => {
    // 'minimap' drops HDR-100; among what is left the exact key hit still leads,
    // which is the point — the second term refines, it does not re-rank.
    expect(keys(rankItems(items, 'hdr-501 minimap'))).toEqual(['HDR-501', 'HDR-5010'])
    expect(keys(rankItems(items, 'minimap hdr-501'))).toEqual(['HDR-501', 'HDR-5010'])
  })

  it('keeps incoming order within a tier', () => {
    const sameTier = [jira('HDR-1', 'apple a'), jira('HDR-2', 'apple b')]
    expect(keys(rankItems(sameTier, 'apple'))).toEqual(['HDR-1', 'HDR-2'])
  })

  it('finds a fake review card by its MR number and title', () => {
    const mixed = [...items, fake(77, 'Bump deps')]
    expect(rankItems(mixed, '!77')).toHaveLength(1)
    expect(rankItems(mixed, 'bump')).toHaveLength(1)
  })

  it('never ranks a keyless item above a key hit', () => {
    // 'mr' appears in the fake card's haystack; nothing else matches it.
    const mixed = [fake(501, 'Something'), jira('HDR-501', 'Trajectory minimap')]
    expect(keys(rankItems(mixed, 'hdr-501'))).toEqual(['HDR-501'])
  })
})

describe('rankCommands', () => {
  const command = (id: string, label: string, synonyms?: readonly string[]): PaletteCommand => ({
    id,
    label,
    synonyms,
    enabled: true,
    run: () => {},
  })

  const commands = [command('new', 'New Ticket', ['create', 'add']), command('refresh', 'Refresh')]

  it('returns everything for an empty query, in declared order', () => {
    expect(rankCommands(commands, '')).toBe(commands)
  })

  it('matches a synonym as well as the label', () => {
    expect(rankCommands(commands, 'create').map((c) => c.id)).toEqual(['new'])
    expect(rankCommands(commands, 'ticket').map((c) => c.id)).toEqual(['new'])
  })

  it('drops commands that match nothing typed', () => {
    expect(rankCommands(commands, 'hdr-501')).toEqual([])
  })

  it('always keeps a command whose label embeds the query, like the filter command', () => {
    const filter = command('filter-board', "Filter board by 'zzz qqq'")
    expect(rankCommands([filter], 'zzz qqq')).toHaveLength(1)
  })
})
