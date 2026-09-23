import { describe, expect, it } from 'vitest'
import {
  ACTION_GROUPS,
  ACTION_GROUP_ORDER,
  ACTION_LABELS,
  ACTION_SHORTCUTS,
  assertShortcutsUnique,
  type ActionKind,
} from './commands'

// The PRD's shortcut table, transcribed. If these two ever disagree, one of them
// is a bug — and this is where you find out.
const PRD_TABLE: Record<ActionKind, string> = {
  'open-detail': 'd',
  'change-status': 's',
  'open-notes': 'n',
  tags: 't',
  'watchlist-toggle': 'w',
  'ai-refine': 'r',
  'ai-ask': 'a',
  'open-in-jira': 'o',
  'copy-jira-link': 'c',
  'copy-issue-key': 'y',
  'open-mr': 'm',
  'review-mr': 'v',
  'open-workspace': 'e',
  'focus-workspace': 'f',
  'discard-workspace': 'x',
}

const ALL_KINDS = Object.keys(PRD_TABLE) as ActionKind[]

describe('ACTION_SHORTCUTS', () => {
  it('assigns the PRD letter to every action kind', () => {
    expect(ACTION_SHORTCUTS).toEqual(PRD_TABLE)
  })

  it('has an entry for every ActionKind', () => {
    for (const kind of ALL_KINDS) {
      expect(ACTION_SHORTCUTS[kind]).toBeTypeOf('string')
      expect(ACTION_SHORTCUTS[kind]).not.toBe('')
    }
  })

  it('ships collision-free', () => {
    expect(() => assertShortcutsUnique(ACTION_SHORTCUTS)).not.toThrow()
    expect(new Set(Object.values(ACTION_SHORTCUTS)).size).toBe(ALL_KINDS.length)
  })

  it('never claims j or k — reserved for list navigation everywhere', () => {
    const keys = Object.values(ACTION_SHORTCUTS)
    expect(keys).not.toContain('j')
    expect(keys).not.toContain('k')
  })

  it('throws loudly when two kinds claim the same letter', () => {
    const collided = { ...ACTION_SHORTCUTS, 'copy-issue-key': 'c' }
    expect(() => assertShortcutsUnique(collided)).toThrow(/collision/u)
  })
})

describe('ACTION_GROUPS', () => {
  it('assigns every action kind a group that is in the render order', () => {
    for (const kind of ALL_KINDS) {
      expect(ACTION_GROUP_ORDER).toContain(ACTION_GROUPS[kind])
    }
  })

  it('labels every action kind for the generated help view', () => {
    for (const kind of ALL_KINDS) {
      expect(ACTION_LABELS[kind]).not.toBe('')
    }
  })
})
