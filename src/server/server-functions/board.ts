import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { BoardIssue } from '../gateways/jira/types'
import type { MrSummary } from '../gateways/gitlab/types'
import { BoardConfigLive } from '../contexts/board/config'
import { LoadBoardError, LoadMrStatusesError } from '../contexts/board/errors'
import { loadBoard } from '../contexts/board/application/load-board'
import { loadMrStatuses } from '../contexts/board/application/load-mr-statuses'
import { appRuntime } from '../runtime/app-runtime'
import { toWire, type WireResult } from '../wire/to-wire'

const boardProgram = loadBoard.pipe(Effect.provide(BoardConfigLive))
const mrStatusesProgram = loadMrStatuses.pipe(Effect.provide(BoardConfigLive))

type LoadBoardErrorWire = Schema.Schema.Encoded<typeof LoadBoardError>
type LoadMrStatusesErrorWire = Schema.Schema.Encoded<typeof LoadMrStatusesError>

export type SearchIssuesResult = WireResult<
  { readonly baseUrl: string; readonly issues: readonly BoardIssue[] },
  LoadBoardErrorWire
>

export type GetMrStatusesResult = WireResult<
  { readonly byKey: Readonly<Record<string, MrSummary>> },
  LoadMrStatusesErrorWire
>

export const searchIssues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SearchIssuesResult> => {
    const wire = await appRuntime.runPromise(toWire(boardProgram, LoadBoardError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      // Defects (unexpected errors like a Jira 5xx) become server-function
      // failures so react-query's `isError` flag flips and the UI shows
      // "Sync failed". Tagged failures (Unauthorized) stay in the wire shape.
      throw new Error('searchIssues: internal error')
    }
    return wire as SearchIssuesResult
  },
)

export const getMrStatuses = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMrStatusesResult> => {
    const wire = await appRuntime.runPromise(toWire(mrStatusesProgram, LoadMrStatusesError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      throw new Error('getMrStatuses: internal error')
    }
    return wire as GetMrStatusesResult
  },
)
