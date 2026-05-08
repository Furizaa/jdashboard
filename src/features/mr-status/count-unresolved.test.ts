import { describe, expect, it } from 'vitest'
import { countUnresolvedThreads } from './count-unresolved'

type DiscussionNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
  system: boolean
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
  system?: boolean
}): DiscussionNote {
  return {
    authorUsername: overrides.authorUsername ?? 'someone-else',
    resolvable: overrides.resolvable ?? true,
    resolved: overrides.resolved ?? false,
    system: overrides.system ?? false,
  }
}

function discussion(notes: DiscussionNote[]): Discussion {
  return { id: `d${nextId++}`, notes }
}

describe('countUnresolvedThreads', () => {
  it('returns 0 for empty input', () => {
    expect(countUnresolvedThreads([])).toBe(0)
  })

  it('counts a single unresolved resolvable thread', () => {
    const d = discussion([note({ authorUsername: 'alice' })])
    expect(countUnresolvedThreads([d])).toBe(1)
  })

  it('excludes resolved resolvable threads', () => {
    const d = discussion([note({ authorUsername: 'alice', resolved: true })])
    expect(countUnresolvedThreads([d])).toBe(0)
  })

  it('counts non-resolvable threads (general MR comments)', () => {
    const d = discussion([note({ authorUsername: 'alice', resolvable: false })])
    expect(countUnresolvedThreads([d])).toBe(1)
  })

  it('excludes system-note threads (assignments, approvals, draft toggles)', () => {
    const d = discussion([note({ authorUsername: 'alice', resolvable: false, system: true })])
    expect(countUnresolvedThreads([d])).toBe(0)
  })

  it('counts threads started by the current user', () => {
    const d = discussion([note({ authorUsername: 'me' }), note({ authorUsername: 'alice' })])
    expect(countUnresolvedThreads([d])).toBe(1)
  })

  it('counts mixed threads correctly', () => {
    const ds: Discussion[] = [
      discussion([note({ authorUsername: 'alice' })]),
      discussion([note({ authorUsername: 'bob', resolved: true })]),
      discussion([note({ authorUsername: 'carol', resolvable: false })]),
      discussion([note({ authorUsername: 'me' })]),
      discussion([note({ authorUsername: 'dave' })]),
    ]
    expect(countUnresolvedThreads(ds)).toBe(4)
  })

  it('skips empty-note discussions', () => {
    const d: Discussion = { id: 'empty', notes: [] }
    expect(countUnresolvedThreads([d])).toBe(0)
  })
})
