import { describe, expect, it } from 'vitest'
import { buildCreatePayload } from './quick-create-payload'
import type { QuickCreateInput } from './quick-create-schema'

const baseForm: QuickCreateInput = {
  type: 'Bug',
  parentKey: 'HDR-3817',
  summary: 'broken thing',
  description: 'repro steps',
}

const currentUser = { accountId: 'acct-123' }
const projectKey = 'HDR'

describe('buildCreatePayload', () => {
  it('always sets priority.name to "Lowest" regardless of type', () => {
    const types = ['Bug', 'Task', 'Improvement'] as const
    for (const type of types) {
      const payload = buildCreatePayload({
        form: { ...baseForm, type },
        currentUser,
        projectKey,
      })
      expect(payload.fields.priority).toEqual({ name: 'Lowest' })
    }
  })

  it('prefixes the summary with "[FE]: " regardless of user input', () => {
    const payload = buildCreatePayload({ form: baseForm, currentUser, projectKey })
    expect(payload.fields.summary.startsWith('[FE]: ')).toBe(true)
    expect(payload.fields.summary).toBe('[FE]: broken thing')
  })

  it('also prefixes when the user already typed "[FE]:"', () => {
    const payload = buildCreatePayload({
      form: { ...baseForm, summary: '[FE]: typed it myself' },
      currentUser,
      projectKey,
    })
    expect(payload.fields.summary.startsWith('[FE]: ')).toBe(true)
  })

  it('sets labels to exactly ["Frontend"]', () => {
    const payload = buildCreatePayload({ form: baseForm, currentUser, projectKey })
    expect(payload.fields.labels).toEqual(['Frontend'])
  })

  it('passes parent.key through unchanged', () => {
    const payload = buildCreatePayload({
      form: { ...baseForm, parentKey: 'HDR-99999' },
      currentUser,
      projectKey,
    })
    expect(payload.fields.parent).toEqual({ key: 'HDR-99999' })
  })

  it('takes project.key from the input arg, not hardcoded', () => {
    const payload = buildCreatePayload({ form: baseForm, currentUser, projectKey: 'OTHER' })
    expect(payload.fields.project).toEqual({ key: 'OTHER' })
  })

  it('takes assignee.accountId from the input arg', () => {
    const payload = buildCreatePayload({
      form: baseForm,
      currentUser: { accountId: 'someone-else' },
      projectKey,
    })
    expect(payload.fields.assignee).toEqual({ accountId: 'someone-else' })
  })

  it('sets description to a doc node, not a string', () => {
    const payload = buildCreatePayload({ form: baseForm, currentUser, projectKey })
    expect(typeof payload.fields.description).toBe('object')
    expect(payload.fields.description.type).toBe('doc')
    expect(payload.fields.description.version).toBe(1)
  })
})
