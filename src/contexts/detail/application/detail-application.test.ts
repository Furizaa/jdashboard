import { describe, expect, it } from 'vitest'
import { match } from 'ts-pattern'
import type { DetailIssue } from '~/kernel'
import { createDetailApplicationService } from './detail-application'
import { DetailNetworkError, DetailNotFound, DetailUnauthorized } from './errors'
import { createFakeDetailCache } from './__fixtures__/fake-cache'
import { createFakeDetailGateway } from './__fixtures__/fake-gateway'

const ISSUE_KEY = 'HDR-1'

function detailIssue(overrides: Partial<DetailIssue> = {}): DetailIssue {
  return {
    key: ISSUE_KEY,
    summary: 'A ticket',
    description: null,
    statusName: 'In Implementation',
    typeName: 'Task',
    labels: [],
    priorityName: null,
    assigneeName: null,
    reporterName: null,
    parent: null,
    subIssues: [],
    links: [],
    comments: [],
    ...overrides,
  }
}

describe('DetailApplicationService.loadIssue', () => {
  it('returns ok with the snapshot when the gateway returns { ok: true }', async () => {
    const gateway = createFakeDetailGateway()
    const cache = createFakeDetailCache()
    gateway.setResult({ ok: true, baseUrl: 'https://j.example', issue: detailIssue() })
    const service = createDetailApplicationService({ gateway, cache })

    const result = await service.loadIssue(ISSUE_KEY)

    expect(result.isOk()).toBe(true)
    match(result)
      .with({ value: { baseUrl: 'https://j.example' } }, ({ value }) => {
        expect(value.issue.key).toBe(ISSUE_KEY)
      })
      .otherwise(() => {
        throw new Error('expected ok with j.example baseUrl')
      })
    expect(gateway.callCount()).toBe(1)
    expect(gateway.lastKey()).toBe(ISSUE_KEY)
  })

  it('returns err DetailUnauthorized when the gateway returns { ok: false, reason: "unauthorized" }', async () => {
    const gateway = createFakeDetailGateway()
    const cache = createFakeDetailCache()
    gateway.setResult({ ok: false, reason: 'unauthorized' })
    const service = createDetailApplicationService({ gateway, cache })

    const result = await service.loadIssue(ISSUE_KEY)

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('DetailUnauthorized')
    expect(result.error).toBeInstanceOf(DetailUnauthorized)
  })

  it('returns err DetailNotFound when the gateway returns { ok: false, reason: "not-found" }', async () => {
    const gateway = createFakeDetailGateway()
    const cache = createFakeDetailCache()
    gateway.setResult({ ok: false, reason: 'not-found' })
    const service = createDetailApplicationService({ gateway, cache })

    const result = await service.loadIssue(ISSUE_KEY)

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('DetailNotFound')
    expect(result.error).toBeInstanceOf(DetailNotFound)
  })

  it('returns err DetailNetworkError carrying the message when the gateway throws', async () => {
    const gateway = createFakeDetailGateway()
    const cache = createFakeDetailCache()
    gateway.setError(new Error('boom'))
    const service = createDetailApplicationService({ gateway, cache })

    const result = await service.loadIssue(ISSUE_KEY)

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('DetailNetworkError')
    expect(result.error).toBeInstanceOf(DetailNetworkError)
    if (result.error instanceof DetailNetworkError) {
      expect(result.error.message).toBe('boom')
    }
  })
})

describe('DetailApplicationService.refresh', () => {
  it('invalidates the issue cache for the given key on each call', () => {
    const gateway = createFakeDetailGateway()
    const cache = createFakeDetailCache()
    const service = createDetailApplicationService({ gateway, cache })

    service.refresh(ISSUE_KEY)
    service.refresh('HDR-2')

    expect(cache.invalidatedKeys()).toEqual([ISSUE_KEY, 'HDR-2'])
  })
})
