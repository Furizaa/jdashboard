import { describe, expect, it } from 'vitest'
import type { QuickCreateInput } from '~/kernel'
import { createCaptureApplicationService } from './capture-application'
import {
  CaptureEpicsNetworkError,
  CaptureEpicsUnauthorized,
  CaptureNetworkError,
  CaptureRejected,
  CaptureUnauthorized,
} from './errors'
import { createFakeCaptureGateway } from './__fixtures__/fake-gateway'

const SAMPLE_INPUT: QuickCreateInput = {
  type: 'Bug',
  parentKey: 'HDR-1',
  summary: 'broken',
  description: 'steps to reproduce',
}

describe('CaptureApplicationService.submit', () => {
  it('returns ok with the snapshot when the gateway returns { ok: true }', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setCreateResult({ ok: true, key: 'HDR-99', baseUrl: 'https://j.example' })
    const service = createCaptureApplicationService({ gateway })

    const result = await service.submit(SAMPLE_INPUT)

    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value).toEqual({ key: 'HDR-99', baseUrl: 'https://j.example' })
    expect(gateway.createCallCount()).toBe(1)
    expect(gateway.lastCreateInput()).toEqual(SAMPLE_INPUT)
  })

  it('forwards the AbortSignal to the gateway', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setCreateResult({ ok: true, key: 'HDR-1', baseUrl: 'https://j' })
    const service = createCaptureApplicationService({ gateway })
    const controller = new AbortController()

    await service.submit(SAMPLE_INPUT, controller.signal)

    expect(gateway.lastCreateSignal()).toBe(controller.signal)
  })

  it('returns err CaptureUnauthorized when gateway returns { ok: false, error: { _tag: "Unauthorized" } }', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setCreateResult({ ok: false, error: { _tag: 'Unauthorized' } })
    const service = createCaptureApplicationService({ gateway })

    const result = await service.submit(SAMPLE_INPUT)

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('CaptureUnauthorized')
    expect(result.error).toBeInstanceOf(CaptureUnauthorized)
  })

  it('returns err CaptureRejected carrying the message when gateway returns { ok: false, error: { _tag: "Rejected" } }', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setCreateResult({
      ok: false,
      error: { _tag: 'Rejected', message: 'parent missing' },
    })
    const service = createCaptureApplicationService({ gateway })

    const result = await service.submit(SAMPLE_INPUT)

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('CaptureRejected')
    expect(result.error).toBeInstanceOf(CaptureRejected)
    if (result.error instanceof CaptureRejected) {
      expect(result.error.message).toBe('parent missing')
    }
  })

  it('returns err CaptureNetworkError carrying the message when the gateway throws', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setCreateError(new Error('boom'))
    const service = createCaptureApplicationService({ gateway })

    const result = await service.submit(SAMPLE_INPUT)

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('CaptureNetworkError')
    expect(result.error).toBeInstanceOf(CaptureNetworkError)
    if (result.error instanceof CaptureNetworkError) {
      expect(result.error.message).toBe('boom')
    }
  })
})

describe('CaptureApplicationService.loadEpics', () => {
  it('returns ok with the epics snapshot when the gateway returns { ok: true }', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setEpicsResult({
      ok: true,
      epics: [
        { key: 'HDR-100', summary: 'Epic A' },
        { key: 'HDR-200', summary: 'Epic B' },
      ],
    })
    const service = createCaptureApplicationService({ gateway })

    const result = await service.loadEpics()

    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error('expected ok')
    expect(result.value.epics).toHaveLength(2)
    expect(result.value.epics[0]).toEqual({ key: 'HDR-100', summary: 'Epic A' })
    expect(gateway.epicsCallCount()).toBe(1)
  })

  it('returns err CaptureEpicsUnauthorized when gateway returns { ok: false, error: { _tag: "Unauthorized" } }', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setEpicsResult({ ok: false, error: { _tag: 'Unauthorized' } })
    const service = createCaptureApplicationService({ gateway })

    const result = await service.loadEpics()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('CaptureEpicsUnauthorized')
    expect(result.error).toBeInstanceOf(CaptureEpicsUnauthorized)
  })

  it('returns err CaptureEpicsNetworkError carrying the message when the gateway throws', async () => {
    const gateway = createFakeCaptureGateway()
    gateway.setEpicsError(new Error('offline'))
    const service = createCaptureApplicationService({ gateway })

    const result = await service.loadEpics()

    expect(result.isErr()).toBe(true)
    if (!result.isErr()) throw new Error('expected err')
    expect(result.error._tag).toBe('CaptureEpicsNetworkError')
    expect(result.error).toBeInstanceOf(CaptureEpicsNetworkError)
    if (result.error instanceof CaptureEpicsNetworkError) {
      expect(result.error.message).toBe('offline')
    }
  })
})
