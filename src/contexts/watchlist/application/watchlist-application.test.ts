import { describe, expect, it } from 'vitest'
import { createWatchlistApplicationService } from './watchlist-application'
import { WatchlistNetworkError, WatchlistUnauthorized } from './errors'
import { createFakeWatchlistGateway } from './__fixtures__/fake-gateway'

describe('WatchlistApplicationService.loadCards', () => {
  it('returns ok with the snapshot when the gateway returns { ok: true }', async () => {
    const gateway = createFakeWatchlistGateway()
    gateway.setCards({
      ok: true,
      baseUrl: 'https://j.example',
      cards: [
        {
          key: 'HDR-1',
          summary: 'Advise',
          statusName: 'Reviewed',
          typeName: 'Task',
          labels: [],
          epic: null,
        },
      ],
    })
    const service = createWatchlistApplicationService({ gateway })

    const result = await service.loadCards()

    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.baseUrl).toBe('https://j.example')
    expect(result.value.cards).toHaveLength(1)
  })

  it('returns err WatchlistUnauthorized when the gateway returns { ok: false }', async () => {
    const gateway = createFakeWatchlistGateway()
    gateway.setCards({ ok: false, error: { _tag: 'Unauthorized' } })
    const service = createWatchlistApplicationService({ gateway })

    const result = await service.loadCards()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error).toBeInstanceOf(WatchlistUnauthorized)
  })

  it('returns err WatchlistNetworkError carrying the message when the gateway throws', async () => {
    const gateway = createFakeWatchlistGateway()
    gateway.setError(new Error('boom'))
    const service = createWatchlistApplicationService({ gateway })

    const result = await service.loadCards()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error).toBeInstanceOf(WatchlistNetworkError)
    if (result.error instanceof WatchlistNetworkError) {
      expect(result.error.message).toBe('boom')
    }
  })
})

describe('WatchlistApplicationService.search', () => {
  it('forwards the query text and returns the candidates on ok', async () => {
    const gateway = createFakeWatchlistGateway()
    gateway.setCandidates({
      ok: true,
      baseUrl: 'https://j.example',
      candidates: [{ key: 'ABC-9', summary: 'x', statusName: 'Open', typeName: 'Bug' }],
    })
    const service = createWatchlistApplicationService({ gateway })

    const result = await service.search('abc')

    expect(gateway.lastSearch()).toBe('abc')
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.candidates).toHaveLength(1)
  })

  it('returns err WatchlistUnauthorized when search returns { ok: false }', async () => {
    const gateway = createFakeWatchlistGateway()
    gateway.setCandidates({ ok: false, error: { _tag: 'Unauthorized' } })
    const service = createWatchlistApplicationService({ gateway })

    const result = await service.search('abc')

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error).toBeInstanceOf(WatchlistUnauthorized)
  })
})
