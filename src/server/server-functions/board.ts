import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { BoardIssue } from '../gateways/jira/types'
import { BoardConfigLive } from '../contexts/board/config'
import { LoadBoardError } from '../contexts/board/errors'
import { loadBoard, type LoadBoardOk } from '../contexts/board/application/load-board'
import { appRuntime } from '../runtime/app-runtime'
import { toWire, type WireResult } from '../wire/to-wire'

const program = loadBoard.pipe(Effect.provide(BoardConfigLive))

type LoadBoardErrorWire = Schema.Schema.Encoded<typeof LoadBoardError>

export type SearchIssuesResult = WireResult<
  { readonly baseUrl: string; readonly issues: readonly BoardIssue[] },
  LoadBoardErrorWire
>

export const searchIssues = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SearchIssuesResult> => {
    const wire = await appRuntime.runPromise(toWire(program, LoadBoardError))
    if (!wire.ok && wire.error._tag === 'InternalError') {
      // Defects (unexpected errors like a Jira 5xx) become server-function
      // failures so react-query's `isError` flag flips and the UI shows
      // "Sync failed". Tagged failures (Unauthorized) stay in the wire shape.
      throw new Error('searchIssues: internal error')
    }
    return wire as SearchIssuesResult
  },
)

export type { LoadBoardOk }
