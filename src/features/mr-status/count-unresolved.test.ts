import { describe, expect, it } from 'vitest'
import type { GitlabDiscussion, GitlabNote } from '~/server/gitlab'
import { countUnresolvedThreads } from './count-unresolved'

let nextId = 1
function note(overrides: {
  id?: number
  author?: Partial<GitlabNote['author']>
  resolvable?: boolean
  resolved?: boolean
}): GitlabNote {
  return {
    id: overrides.id ?? nextId++,
    author: {
      id: overrides.author?.id ?? 1,
      username: overrides.author?.username ?? 'someone-else',
      name: overrides.author?.name ?? 'Someone Else',
    },
    resolvable: overrides.resolvable ?? true,
    resolved: overrides.resolved ?? false,
  }
}

function discussion(notes: GitlabNote[]): GitlabDiscussion {
  return { id: `d${nextId++}`, notes }
}

const ME = 'me'

describe('countUnresolvedThreads', () => {
  it('returns 0 for empty input', () => {
    expect(countUnresolvedThreads([], ME)).toBe(0)
  })

  it('counts a single unresolved resolvable thread from another user', () => {
    const d = discussion([note({ author: { username: 'alice' } })])
    expect(countUnresolvedThreads([d], ME)).toBe(1)
  })

  it('excludes resolved threads', () => {
    const d = discussion([note({ author: { username: 'alice' }, resolved: true })])
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })

  it('excludes non-resolvable threads (general comments)', () => {
    const d = discussion([note({ author: { username: 'alice' }, resolvable: false })])
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })

  it('excludes threads started by the current user, even with replies from others', () => {
    const d = discussion([
      note({ author: { username: ME } }),
      note({ author: { username: 'alice' } }),
    ])
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })

  it('counts mixed threads correctly', () => {
    const ds: GitlabDiscussion[] = [
      discussion([note({ author: { username: 'alice' } })]),
      discussion([note({ author: { username: 'bob' }, resolved: true })]),
      discussion([note({ author: { username: 'carol' }, resolvable: false })]),
      discussion([note({ author: { username: ME } })]),
      discussion([note({ author: { username: 'dave' } })]),
    ]
    expect(countUnresolvedThreads(ds, ME)).toBe(2)
  })

  it('skips empty-note discussions', () => {
    const d: GitlabDiscussion = { id: 'empty', notes: [] }
    expect(countUnresolvedThreads([d], ME)).toBe(0)
  })
})
