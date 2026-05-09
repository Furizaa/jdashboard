import { describe, expect, it } from 'vitest'
import { buildCreatePayload } from './build-create-payload'

describe('buildCreatePayload', () => {
  it('prefixes the summary, lifts ADF description, and forwards parent + assignee', () => {
    const body = buildCreatePayload({
      form: {
        type: 'Bug',
        summary: 'broken',
        description: 'steps',
        parentKey: 'HDR-1',
      },
      currentUser: { accountId: 'acc-1' },
      projectKey: 'HDR',
      config: { summaryPrefix: '[FE]: ', labels: ['Frontend'], priority: 'Lowest' },
    })
    expect(body.fields.project).toEqual({ key: 'HDR' })
    expect(body.fields.issuetype).toEqual({ name: 'Bug' })
    expect(body.fields.summary).toBe('[FE]: broken')
    expect(body.fields.priority).toEqual({ name: 'Lowest' })
    expect(body.fields.labels).toEqual(['Frontend'])
    expect(body.fields.parent).toEqual({ key: 'HDR-1' })
    expect(body.fields.assignee).toEqual({ accountId: 'acc-1' })
    expect(body.fields.description.type).toBe('doc')
  })
})
