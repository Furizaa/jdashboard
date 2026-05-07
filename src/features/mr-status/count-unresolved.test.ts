import { describe, expect, it } from 'vitest'
import { countUnresolvedThreads } from './count-unresolved'

type DiscussionNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
}

type Discussion = {
  id: string
  notes: DiscussionNote[]
}

let nextId = 1
function note(overrides: {
  authorUsername?: string
  resolvable?: boolean
  resolved?: boolean
}): DiscussionNote {
  return {
    authorUsername: overrides.authorUsername ?? 'someone-else',
    resolvable: overrides.resolvable ?? true,
    resolved: overrides.resolved ?? false,
  }
}

function discussion(notes: DiscussionNote[]): Discussion {
  return { id: `d${nextId++}`, notes }
}

const ME = 'me'

describe('countUnresolvedThreads', () => {
  it('returns 0 for empty input', () => {
    expect(countUnresolvedThreads([], ME)).toBe(0)
  })

  it('counts a single unresolved resolvable thread from another user', () => {
    const d = discussion([note({ authorUsername: 'alice' })])
    expect(countUnresolvedThreads([d], ME)).toBe(1)
  })

  it('excludes resolved threads', () => {
    const d = discussion([note({ authorUsername: 'alice', resolved: true })])
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })

  it('excludes non-resolvable threads (general comments)', () => {
    const d = discussion([note({ authorUsername: 'alice', resolvable: false })])
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })

  it('excludes threads started by the current user, even with replies from others', () => {
    const d = discussion([note({ authorUsername: ME }), note({ authorUsername: 'alice' })])
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })

  it('counts mixed threads correctly', () => {
    const ds: Discussion[] = [
      discussion([note({ authorUsername: 'alice' })]),
      discussion([note({ authorUsername: 'bob', resolved: true })]),
      discussion([note({ authorUsername: 'carol', resolvable: false })]),
      discussion([note({ authorUsername: ME })]),
      discussion([note({ authorUsername: 'dave' })]),
    ]
    expect(countUnresolvedThreads(ds, ME)).toBe(2)
  })

  it('skips empty-note discussions', () => {
    const d: Discussion = { id: 'empty', notes: [] }
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })
})
