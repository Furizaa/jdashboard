import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import {
  readWatchlistLanes,
  setWatchlistLanes,
  type WatchlistLaneConfig,
  type WatchlistLanesState,
  type WatchlistLanesStoreDeps,
} from '../lib/watchlist-lanes-store'

// The Watchlist Board's lane configuration is single-user machine state with no
// external system behind it, so — like the tags and watchlist mutations — the
// handlers are plain try/catch over the disk store rather than an Effect program.
// The read handler always resolves (the store reads fault-tolerantly to the empty
// configuration), so it needs no wire error envelope; the write returns the
// watchlist-style `{ ok }` result.

export type GetWatchlistLanesResult = WatchlistLanesState

export type SetWatchlistLanesResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly message: string } }

function storeDeps(): WatchlistLanesStoreDeps {
  return {
    homeDir: homedir(),
    readFile: (p) => readFile(p, 'utf8'),
    writeFile: (p, data) => writeFile(p, data, 'utf8'),
    mkdir: (p) => mkdir(p, { recursive: true }).then(() => {}),
  }
}

export const getWatchlistLanes = createServerFn({ method: 'GET' }).handler(
  (): Promise<GetWatchlistLanesResult> => readWatchlistLanes(storeDeps()),
)

export const setWatchlistLanesFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { lanes: readonly WatchlistLaneConfig[] }) => ({
    lanes: Array.isArray(data?.lanes) ? data.lanes : [],
  }))
  .handler(async ({ data }): Promise<SetWatchlistLanesResult> => {
    try {
      await setWatchlistLanes(data.lanes, storeDeps())
      return { ok: true }
    } catch (e) {
      return { ok: false, error: { message: e instanceof Error ? e.message : 'unknown error' } }
    }
  })
