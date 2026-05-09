import { describe, expect, it } from 'vitest'
import { match } from 'ts-pattern'
import { createBoardApplicationService } from './board-application'
import { BoardNetworkError, BoardUnauthorized } from './errors'
import { createFakeBoardCache } from './__fixtures__/fake-cache'
import { createFakeBoardGateway } from './__fixtures__/fake-gateway'

describe('BoardApplicationService.loadBoard', () => {
  it('returns ok with the snapshot when the gateway returns { ok: true }', async () => {
    const gateway = createFakeBoardGateway()
    const cache = createFakeBoardCache()
    gateway.setResult({
      ok: true,
      baseUrl: 'https://j.example',
      issues: [
        {
          key: 'A-1',
          summary: 's',
          statusName: 'Reviewed',
          typeName: 'Task',
          labels: [],
          epic: null,
        },
      ],
    })
    const service = createBoardApplicationService({ gateway, cache })

    const result = await service.loadBoard()

    expect(result.isOk()).toBe(true)
    match(result)
      .with({ value: { baseUrl: 'https://j.example' } }, ({ value }) => {
        expect(value.issues).toHaveLength(1)
        expect(value.issues[0]?.key).toBe('A-1')
      })
      .otherwise(() => {
        throw new Error('expected ok with j.example baseUrl')
      })
    expect(gateway.callCount()).toBe(1)
  })

  it('returns err BoardUnauthorized when the gateway returns { ok: false, reason: "unauthorized" }', async () => {
    const gateway = createFakeBoardGateway()
    const cache = createFakeBoardCache()
    gateway.setResult({ ok: false, reason: 'unauthorized' })
    const service = createBoardApplicationService({ gateway, cache })

    const result = await service.loadBoard()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('BoardUnauthorized')
    expect(result.error).toBeInstanceOf(BoardUnauthorized)
  })

  it('returns err BoardNetworkError carrying the message when the gateway throws', async () => {
    const gateway = createFakeBoardGateway()
    const cache = createFakeBoardCache()
    gateway.setError(new Error('boom'))
    const service = createBoardApplicationService({ gateway, cache })

    const result = await service.loadBoard()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('BoardNetworkError')
    expect(result.error).toBeInstanceOf(BoardNetworkError)
    if (result.error instanceof BoardNetworkError) {
      expect(result.error.message).toBe('boom')
    }
  })
})

describe('BoardApplicationService.refresh', () => {
  it('invalidates the board cache once per call', () => {
    const gateway = createFakeBoardGateway()
    const cache = createFakeBoardCache()
    const service = createBoardApplicationService({ gateway, cache })

    service.refresh()
    service.refresh()

    expect(cache.invalidations()).toBe(2)
  })
})
