import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { BoardIssue } from '../gateways/jira/types'
import { assertIssueKey } from '../lib/jql'
import {
  addWatchlistKey,
  readWatchlistKeys,
  removeWatchlistKey,
  type WatchlistStoreDeps,
} from '../lib/watchlist-store'
import { loadWatchlistCards } from '../contexts/watchlist/application/load-watchlist-cards'
import {
  searchCandidates,
  type WatchlistCandidate,
} from '../contexts/watchlist/application/search-candidates'
import { WatchlistConfigLive } from '../contexts/watchlist/config'
import { LoadWatchlistCardsError, SearchCandidatesError } from '../contexts/watchlist/errors'
import { runWire } from './run-wire'
import type { WireResult } from '../wire/to-wire'

type LoadWatchlistCardsErrorWire = Schema.Schema.Encoded<typeof LoadWatchlistCardsError>
type SearchCandidatesErrorWire = Schema.Schema.Encoded<typeof SearchCandidatesError>

export type GetWatchlistCardsResult = WireResult<
  { readonly baseUrl: string; readonly cards: readonly BoardIssue[] },
  LoadWatchlistCardsErrorWire
>

export type SearchWatchlistCandidatesResult = WireResult<
  { readonly baseUrl: string; readonly candidates: readonly WatchlistCandidate[] },
  SearchCandidatesErrorWire
>

export type WatchlistMutationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } }

export type { WatchlistCandidate }

function storeDeps(): WatchlistStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, data) => writeFile(p, data, 'utf8'),
    mkdir: (p) => mkdir(p, { recursive: true }).then(() => {}),
  }
}

function requireIssueKey(label: string, value: unknown): string {
  return assertIssueKey(typeof value === 'string' ? value : '', label)
}

export const getWatchlistCards = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetWatchlistCardsResult> => {
    const keys = await readWatchlistKeys(storeDeps())
    const program = loadWatchlistCards(keys).pipe(Effect.provide(WatchlistConfigLive))
    return runWire(program, LoadWatchlistCardsError, 'getWatchlistCards')
  },
)

export const searchWatchlistCandidates = createServerFn({ method: 'POST' })
  .inputValidator((data: { text: string }) => ({
    text: typeof data?.text === 'string' ? data.text : '',
  }))
  .handler(
    async ({ data }): Promise<SearchWatchlistCandidatesResult> =>
      runWire(
        searchCandidates(data.text).pipe(Effect.provide(WatchlistConfigLive)),
        SearchCandidatesError,
        'searchWatchlistCandidates',
      ),
  )

export const addToWatchlist = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string }) => ({
    key: requireIssueKey('addToWatchlist', data?.key),
  }))
  .handler(async ({ data }): Promise<WatchlistMutationResult> => {
    try {
      await addWatchlistKey(data.key, storeDeps())
      return { ok: true }
    } catch (e) {
      return { ok: false, error: { message: e instanceof Error ? e.message : 'unknown error' } }
    }
  })

export const removeFromWatchlist = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string }) => ({
    key: requireIssueKey('removeFromWatchlist', data?.key),
  }))
  .handler(async ({ data }): Promise<WatchlistMutationResult> => {
    try {
      await removeWatchlistKey(data.key, storeDeps())
      return { ok: true }
    } catch (e) {
      return { ok: false, error: { message: e instanceof Error ? e.message : 'unknown error' } }
    }
  })
