import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { EpicRef, GatewayUser } from '../gateways/jira/types'
import { CaptureConfigLive } from '../contexts/capture/config'
import { GetMyselfError, LoadMyEpicsError, QuickCreateError } from '../contexts/capture/errors'
import {
  getMyself as getMyselfProgram,
  type GetMyselfOk,
} from '../contexts/capture/application/get-myself'
import {
  loadMyEpics as loadMyEpicsProgram,
  type LoadMyEpicsOk,
} from '../contexts/capture/application/load-my-epics'
import {
  quickCreate as quickCreateProgram,
  type QuickCreateOk,
} from '../contexts/capture/application/quick-create'
import {
  quickCreateSchema,
  type QuickCreateInput,
} from '../contexts/capture/application/quick-create-schema'
import { appRuntime } from '../runtime/app-runtime'
import { toWire, type WireResult } from '../wire/to-wire'

type GetMyselfErrorWire = Schema.Schema.Encoded<typeof GetMyselfError>
type LoadMyEpicsErrorWire = Schema.Schema.Encoded<typeof LoadMyEpicsError>
type QuickCreateErrorWire = Schema.Schema.Encoded<typeof QuickCreateError>

export type GetMyselfResult = WireResult<{ readonly user: GatewayUser }, GetMyselfErrorWire>

export type GetMyEpicsResult = WireResult<
  { readonly epics: readonly EpicRef[] },
  LoadMyEpicsErrorWire
>

export type CreateIssueResult = WireResult<
  { readonly key: string; readonly baseUrl: string },
  QuickCreateErrorWire
>

export const getMyself = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMyselfResult> => {
    const wire = await appRuntime.runPromise(toWire(getMyselfProgram, GetMyselfError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('getMyself: internal error')
    }
    return wire as GetMyselfResult
  },
)

export const createIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown): QuickCreateInput => {
    const parsed = quickCreateSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(`createIssue: invalid input — ${parsed.error.message}`)
    }
    return parsed.data
  })
  .handler(async ({ data }): Promise<CreateIssueResult> => {
    const program = quickCreateProgram(data).pipe(Effect.provide(CaptureConfigLive))
    const wire = await appRuntime.runPromise(toWire(program, QuickCreateError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('createIssue: internal error')
    }
    return wire as CreateIssueResult
  })

export const getMyEpics = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMyEpicsResult> => {
    const program = loadMyEpicsProgram.pipe(Effect.provide(CaptureConfigLive))
    const wire = await appRuntime.runPromise(toWire(program, LoadMyEpicsError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('getMyEpics: internal error')
    }
    return wire as GetMyEpicsResult
  },
)

export type { GetMyselfOk, LoadMyEpicsOk, QuickCreateOk }
