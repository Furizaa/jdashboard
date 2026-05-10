import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { EpicRef, JiraUser } from '../gateways/jira/types'
import { CaptureConfigLive } from '../contexts/capture/config'
import { LoadMyEpicsError, LoadMyselfError, QuickCreateError } from '../contexts/capture/errors'
import { loadMyself } from '../contexts/capture/application/load-myself'
import { loadMyEpics } from '../contexts/capture/application/load-my-epics'
import { quickCreate as quickCreateProgram } from '../contexts/capture/application/quick-create'
import {
  quickCreateSchema,
  type QuickCreateInput,
} from '../contexts/capture/application/quick-create-schema'
import { runWire } from './run-wire'
import type { WireResult } from '../wire/to-wire'

type LoadMyselfErrorWire = Schema.Schema.Encoded<typeof LoadMyselfError>
type LoadMyEpicsErrorWire = Schema.Schema.Encoded<typeof LoadMyEpicsError>
type QuickCreateErrorWire = Schema.Schema.Encoded<typeof QuickCreateError>

export type GetMyselfResult = WireResult<{ readonly user: JiraUser }, LoadMyselfErrorWire>

export type GetMyEpicsResult = WireResult<
  { readonly epics: readonly EpicRef[] },
  LoadMyEpicsErrorWire
>

export type CreateIssueResult = WireResult<
  { readonly key: string; readonly baseUrl: string },
  QuickCreateErrorWire
>

export const getMyself = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMyselfResult> => runWire(loadMyself, LoadMyselfError, 'getMyself'),
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
    return runWire(program, QuickCreateError, 'createIssue')
  })

export const getMyEpics = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMyEpicsResult> => {
    const program = loadMyEpics.pipe(Effect.provide(CaptureConfigLive))
    return runWire(program, LoadMyEpicsError, 'getMyEpics')
  },
)
