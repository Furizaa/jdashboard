import { describe, expect, it } from 'vitest'
import { buildEpicJql } from './epic-jql'

describe('buildEpicJql', () => {
  it('produces the expected literal JQL for a standard project key', () => {
    expect(buildEpicJql('HDR')).toBe(
      'issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = "HDR"',
    )
  })

  it('double-quotes a project key containing hyphens', () => {
    expect(buildEpicJql('DR-FE')).toBe(
      'issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = "DR-FE"',
    )
  })
})
