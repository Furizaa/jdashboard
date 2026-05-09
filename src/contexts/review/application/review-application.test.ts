import { describe, expect, it } from 'vitest'
import { match } from 'ts-pattern'
import { createReviewApplicationService } from './review-application'
import { ReviewNetworkError, ReviewUnauthorized } from './errors'
import { createFakeReviewCache } from './__fixtures__/fake-cache'
import { createFakeReviewGateway } from './__fixtures__/fake-gateway'

describe('ReviewApplicationService.loadReviewCards', () => {
  it('returns ok with the snapshot when the gateway returns { ok: true }', async () => {
    const gateway = createFakeReviewGateway()
    const cache = createFakeReviewCache()
    gateway.setResult({
      ok: true,
      baseUrl: 'https://j.example',
      cards: [
        {
          kind: 'review-fake',
          iid: 42,
          webUrl: 'https://gl.example/g/p/-/merge_requests/42',
          title: 'WIP something',
          bucket: 'needs-review',
          mrState: 'opened',
          reviewers: [],
          unresolvedCount: 0,
          ciState: 'none',
          jiraKeyAttempted: null,
        },
      ],
    })
    const service = createReviewApplicationService({ gateway, cache })

    const result = await service.loadReviewCards()

    expect(result.isOk()).toBe(true)
    match(result)
      .with({ value: { baseUrl: 'https://j.example' } }, ({ value }) => {
        expect(value.cards).toHaveLength(1)
        expect(value.cards[0]?.iid).toBe(42)
      })
      .otherwise(() => {
        throw new Error('expected ok with j.example baseUrl')
      })
    expect(gateway.callCount()).toBe(1)
  })

  it('returns err ReviewUnauthorized when the gateway returns { ok: false, reason: "unauthorized" }', async () => {
    const gateway = createFakeReviewGateway()
    const cache = createFakeReviewCache()
    gateway.setResult({ ok: false, error: { _tag: 'Unauthorized' } })
    const service = createReviewApplicationService({ gateway, cache })

    const result = await service.loadReviewCards()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('ReviewUnauthorized')
    expect(result.error).toBeInstanceOf(ReviewUnauthorized)
  })

  it('returns err ReviewNetworkError carrying the message when the gateway throws', async () => {
    const gateway = createFakeReviewGateway()
    const cache = createFakeReviewCache()
    gateway.setError(new Error('boom'))
    const service = createReviewApplicationService({ gateway, cache })

    const result = await service.loadReviewCards()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('ReviewNetworkError')
    expect(result.error).toBeInstanceOf(ReviewNetworkError)
    if (result.error instanceof ReviewNetworkError) {
      expect(result.error.message).toBe('boom')
    }
  })
})

describe('ReviewApplicationService.refresh', () => {
  it('invalidates the review-cards cache once per call', () => {
    const gateway = createFakeReviewGateway()
    const cache = createFakeReviewCache()
    const service = createReviewApplicationService({ gateway, cache })

    service.refresh()
    service.refresh()

    expect(cache.invalidations()).toBe(2)
  })
})
