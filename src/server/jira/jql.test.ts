import { describe, expect, it } from 'vitest'
import { buildBoardJql } from './jql'

describe('buildBoardJql', () => {
  it('produces the expected JQL for a default config', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'Frontend', doneWindowDays: 14 }),
    ).toBe(
      'project = HDR AND assignee = currentUser() AND labels = "Frontend" AND (statusCategory != Done OR status changed to Done after -14d) ORDER BY rank',
    )
  })

  it('quotes labels containing whitespace', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'Front End', doneWindowDays: 14 }),
    ).toContain('labels = "Front End"')
  })

  it('escapes embedded double quotes in labels', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'a"b', doneWindowDays: 14 }),
    ).toContain('labels = "a\\"b"')
  })

  it('escapes backslashes in labels', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'a\\b', doneWindowDays: 14 }),
    ).toContain('labels = "a\\\\b"')
  })

  it('emits -0d when doneWindowDays is 0', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'Frontend', doneWindowDays: 0 }),
    ).toContain('status changed to Done after -0d')
  })

  it('emits a large window verbatim', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'Frontend', doneWindowDays: 365 }),
    ).toContain('status changed to Done after -365d')
  })

  it('always ends with ORDER BY rank', () => {
    expect(
      buildBoardJql({ projectKey: 'HDR', label: 'Frontend', doneWindowDays: 14 }),
    ).toMatch(/ ORDER BY rank$/)
  })
})
