import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { BoardIssue } from '../gateways/jira/types'
import type { MrSummary } from '../gateways/gitlab/types'
import { BoardConfigLive } from '../contexts/board/config'
import { LoadBoardError, LoadMrStatusesError } from '../contexts/board/errors'
import { loadBoard } from '../contexts/board/application/load-board'
import { loadMrStatuses } from '../contexts/board/application/load-mr-statuses'
import { runWire } from './run-wire'
import type { WireResult } from '../wire/to-wire'

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
  async (): Promise<SearchIssuesResult> => runWire(boardProgram, LoadBoardError, 'searchIssues'),
)

export const getMrStatuses = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMrStatusesResult> =>
    runWire(mrStatusesProgram, LoadMrStatusesError, 'getMrStatuses'),
)
