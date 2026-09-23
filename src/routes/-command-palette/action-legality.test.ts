import { describe, expect, it } from 'vitest'
import type { ReviewCardFake, ReviewCardReal } from '~/kernel'
import { ACTION_SHORTCUTS, type ActionKind, type BoardIssue, type WorkItem } from '~/kernel'
import { legalActions, workspaceTargetFields, workspaceTargetKey } from './action-legality'
import type { ActionContext } from './action-legality'

const BASE_URL = 'https://jira.example'

function issue(overrides: Partial<BoardIssue> = {}): BoardIssue {
  return {
    key: 'HDR-1',
    summary: 'Trajectory minimap',
    statusName: 'In Implementation',
    typeName: 'Story',
    labels: [],
    epic: null,
    ...overrides,
  }
}

const realCard: ReviewCardReal = {
  kind: 'review-real',
  iid: 42,
  webUrl: 'https://gitlab.example/mr/42',
  title: 'HDR-1: minimap',
  bucket: 'needs-review',
  mrState: 'opened',
  reviewers: [],
  unresolvedCount: 0,
  ciState: 'none',
  priority: null,
  jira: { key: 'HDR-1', summary: 'Trajectory minimap', typeName: 'Story', labels: [], epic: null },
}

const fakeCard: ReviewCardFake = {
  kind: 'review-fake',
  iid: 77,
  webUrl: 'https://gitlab.example/mr/77',
  title: 'Bump deps',
  bucket: 'needs-review',
  mrState: 'opened',
  reviewers: [],
  unresolvedCount: 0,
  ciState: 'none',
  priority: null,
  jiraKeyAttempted: null,
}

const JIRA: WorkItem = { kind: 'jira', issue: issue() }
const WATCHED: WorkItem = { kind: 'watchlist', issue: issue() }
const REVIEW_REAL: WorkItem = { kind: 'review-real', card: realCard }
const REVIEW_FAKE: WorkItem = { kind: 'review-fake', card: fakeCard }

function context(overrides: Partial<ActionContext> = {}): ActionContext {
  return {
    jiraBaseUrl: BASE_URL,
    watchlistKeys: [],
    openWorkspaceKeys: [],
    mr: null,
    transitions: 'some',
    tagCount: 2,
    ...overrides,
  }
}

const kinds = (item: WorkItem, ctx: ActionContext = context()): readonly ActionKind[] =>
  legalActions(item, ctx).map((a) => a.kind)

const labelFor = (item: WorkItem, kind: ActionKind, ctx: ActionContext = context()) =>
  legalActions(item, ctx).find((a) => a.kind === kind)?.label

describe('legalActions for a Jira-backed item', () => {
  it('offers the ticket actions for an assigned board issue', () => {
    expect(kinds(JIRA)).toEqual([
      'open-detail',
      'change-status',
      'open-notes',
      'watchlist-toggle',
      'tags',
      'ai-refine',
      'ai-ask',
      'open-in-jira',
      'copy-jira-link',
      'copy-issue-key',
      'open-workspace',
    ])
  })

  it('offers the same set for a watchlist card — the source does not change legality', () => {
    expect(kinds(WATCHED)).toEqual(kinds(JIRA))
  })

  it('offers the same set for a review-real card, which carries a Jira key', () => {
    expect(kinds(REVIEW_REAL)).toEqual(kinds(JIRA))
  })

  it('drops the Jira link actions until the board has loaded a base URL', () => {
    const early = kinds(JIRA, context({ jiraBaseUrl: null }))
    expect(early).not.toContain('open-in-jira')
    expect(early).not.toContain('copy-jira-link')
    // The key is still copyable — that needs no base URL.
    expect(early).toContain('copy-issue-key')
  })
})

describe('the AI hand-offs', () => {
  it('are legal on anything with a ticket behind it', () => {
    for (const item of [JIRA, WATCHED, REVIEW_REAL]) {
      expect(kinds(item)).toContain('ai-refine')
      expect(kinds(item)).toContain('ai-ask')
    }
  })

  it('are absent on a fake review card — there is no ticket and so no note', () => {
    const fake = kinds(REVIEW_FAKE, context({ mr: { iid: 77, webUrl: fakeCard.webUrl } }))
    expect(fake).not.toContain('ai-refine')
    expect(fake).not.toContain('ai-ask')
  })
})

describe('legalActions for a fake review card', () => {
  it('offers exactly the MR pair — there is no ticket to act on', () => {
    expect(kinds(REVIEW_FAKE, context({ mr: { iid: 77, webUrl: fakeCard.webUrl } }))).toEqual([
      'open-mr',
      'review-mr',
    ])
  })

  it('offers no workspace action — a workspace is a worktree for a ticket', () => {
    const all = kinds(
      REVIEW_FAKE,
      context({ mr: { iid: 77, webUrl: fakeCard.webUrl }, openWorkspaceKeys: ['HDR-1'] }),
    )
    expect(all).not.toContain('open-workspace')
    expect(all).not.toContain('focus-workspace')
    expect(all).not.toContain('discard-workspace')
  })
})

describe('watchlist legality', () => {
  it('offers Add when the ticket is not a member', () => {
    expect(labelFor(JIRA, 'watchlist-toggle')).toBe('Add to Watchlist')
  })

  it('offers Remove when it is', () => {
    expect(labelFor(JIRA, 'watchlist-toggle', context({ watchlistKeys: ['HDR-1'] }))).toBe(
      'Remove from Watchlist',
    )
  })

  it('matches on the ticket key, not on the item being a watchlist card', () => {
    // An *assigned* ticket that also happens to be watchlisted reads as a member.
    expect(labelFor(WATCHED, 'watchlist-toggle', context({ watchlistKeys: ['HDR-2'] }))).toBe(
      'Add to Watchlist',
    )
  })
})

describe('status sub-list legality', () => {
  it('offers Change Status while a ticket is known to have transitions', () => {
    expect(kinds(JIRA, context({ transitions: 'some' }))).toContain('change-status')
  })

  it('offers it optimistically while the fetch has not resolved', () => {
    // Jira decides per ticket, and the fetch only fires once the action list is
    // entered — so "unknown" has to mean "offer it and say what happened".
    expect(kinds(JIRA, context({ transitions: 'unknown' }))).toContain('change-status')
  })

  it('withholds it once the ticket is known to have none', () => {
    expect(kinds(JIRA, context({ transitions: 'none' }))).not.toContain('change-status')
  })

  it('never offers it for an item with no ticket behind it', () => {
    expect(kinds(REVIEW_FAKE, context({ transitions: 'some' }))).not.toContain('change-status')
  })
})

describe('tag sub-list legality', () => {
  it('offers Tags when any tag is defined', () => {
    expect(kinds(JIRA, context({ tagCount: 1 }))).toContain('tags')
  })

  it('withholds it when none are — an empty list is a dead end', () => {
    expect(kinds(JIRA, context({ tagCount: 0 }))).not.toContain('tags')
  })

  it('never offers it for an item with no ticket behind it', () => {
    expect(kinds(REVIEW_FAKE, context({ tagCount: 5 }))).not.toContain('tags')
  })
})

describe('MR legality', () => {
  it('offers nothing MR-shaped when no MR resolves', () => {
    expect(kinds(JIRA)).not.toContain('open-mr')
    expect(kinds(JIRA)).not.toContain('review-mr')
  })

  it('offers both when one does', () => {
    const withMr = kinds(JIRA, context({ mr: { iid: 9, webUrl: 'https://gitlab/9' } }))
    expect(withMr).toContain('open-mr')
    expect(withMr).toContain('review-mr')
  })
})

describe('workspace legality', () => {
  it('offers Open-in when no workspace is open for the ticket', () => {
    expect(kinds(JIRA)).toContain('open-workspace')
    expect(kinds(JIRA)).not.toContain('focus-workspace')
    expect(kinds(JIRA)).not.toContain('discard-workspace')
  })

  it('offers Focus and Discard when one is, and never Open-in as well', () => {
    const open = kinds(JIRA, context({ openWorkspaceKeys: ['HDR-1'] }))
    expect(open).toContain('focus-workspace')
    expect(open).toContain('discard-workspace')
    expect(open).not.toContain('open-workspace')
  })

  it("keys off the ticket, so another ticket's open workspace does not count", () => {
    expect(kinds(JIRA, context({ openWorkspaceKeys: ['HDR-999'] }))).toContain('open-workspace')
  })
})

describe('legalActions invariants', () => {
  const everyShape: readonly WorkItem[] = [JIRA, WATCHED, REVIEW_REAL, REVIEW_FAKE]
  const everyContext: readonly ActionContext[] = [
    context(),
    context({ jiraBaseUrl: null }),
    context({ watchlistKeys: ['HDR-1'] }),
    context({ openWorkspaceKeys: ['HDR-1'] }),
    context({ mr: { iid: 1, webUrl: 'https://gitlab/1' } }),
    context({ transitions: 'none' }),
    context({ transitions: 'unknown' }),
    context({ tagCount: 0 }),
    context({
      watchlistKeys: ['HDR-1'],
      openWorkspaceKeys: ['HDR-1'],
      mr: { iid: 1, webUrl: 'https://gitlab/1' },
    }),
  ]

  it('never emits a kind twice for the same item', () => {
    for (const item of everyShape) {
      for (const ctx of everyContext) {
        const emitted = kinds(item, ctx)
        expect(new Set(emitted).size).toBe(emitted.length)
      }
    }
  })

  it('never emits an unlabelled action', () => {
    for (const item of everyShape) {
      for (const ctx of everyContext) {
        for (const descriptor of legalActions(item, ctx)) {
          expect(descriptor.label).not.toBe('')
        }
      }
    }
  })

  // Every kind the palette can offer now has an effect behind it; nothing is
  // still a placeholder.
  it('offers every kind in the kernel map across the shapes and states above', () => {
    const offered = new Set(
      everyShape.flatMap((item) => everyContext.flatMap((ctx) => kinds(item, ctx))),
    )
    for (const kind of Object.keys(ACTION_SHORTCUTS) as ActionKind[]) {
      expect(offered).toContain(kind)
    }
  })
})

describe('workspace target helpers', () => {
  it('reads the ticket key off every Jira-backed shape and nothing off a fake card', () => {
    expect(workspaceTargetKey(JIRA)).toBe('HDR-1')
    expect(workspaceTargetKey(WATCHED)).toBe('HDR-1')
    expect(workspaceTargetKey(REVIEW_REAL)).toBe('HDR-1')
    expect(workspaceTargetKey(REVIEW_FAKE)).toBeNull()
  })

  it('reads the type and title the branch slug needs', () => {
    expect(workspaceTargetFields(JIRA)).toEqual({
      typeName: 'Story',
      title: 'Trajectory minimap',
    })
    expect(workspaceTargetFields(REVIEW_REAL)).toEqual({
      typeName: 'Story',
      title: 'Trajectory minimap',
    })
    expect(workspaceTargetFields(REVIEW_FAKE)).toBeNull()
  })
})
