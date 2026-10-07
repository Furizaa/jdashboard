import { useEffect, useRef } from 'react'
import { useCloseExplain, useExplainDiffs, useStartExplain } from '~/coordinator'
import type {
  CloseExplainResult,
  ExplainDiffFile,
  ExplainRunEvent,
  StartExplainResult,
} from '~/kernel'

// The React-bound half of Explain: the SSE subscription and the two mutations.
// Everything stateful lives in the view-model; this file only wires the browser
// to it (ADR-0003).

/** The run to watch, or `null` for "nothing is in flight on this tab". */
export type StreamTarget = { readonly iid: number; readonly runId: string } | null

/**
 * Watch one run's progress over server-sent events, and stop when the target
 * changes or the component goes away.
 *
 * `EventSource` rather than `fetch` + a reader: the endpoint is a plain
 * `text/event-stream` and this is exactly what the API is for. Its one
 * inconvenience is reconnection — it retries whenever the server closes the
 * stream, which our server does on purpose at the end of a run — so this hook
 * closes the connection itself on the terminal message and on an error. A 404
 * (a run the server has forgotten, e.g. after a restart) therefore closes once
 * and reports `onLost`, instead of retrying forever.
 *
 * Handlers are held in a ref so a fresh closure per render never re-opens the
 * connection; the effect depends only on the run id, which is the identity of
 * the thing being watched.
 */
export function useExplainStream(
  target: StreamTarget,
  handlers: {
    readonly onEvent: (iid: number, runId: string, event: ExplainRunEvent) => void
    readonly onLost: (iid: number, runId: string) => void
  },
): void {
  const latest = useRef(handlers)
  latest.current = handlers
  const iid = target?.iid ?? null
  const runId = target?.runId ?? null

  useEffect(() => {
    if (iid === null || runId === null) return
    const source = new EventSource(`/api/explain/${encodeURIComponent(runId)}/stream`)
    let closed = false
    const close = () => {
      if (closed) return
      closed = true
      source.close()
    }

    source.addEventListener('message', (message: MessageEvent<string>) => {
      let event: ExplainRunEvent
      try {
        event = JSON.parse(message.data) as ExplainRunEvent
      } catch {
        // A frame we cannot read is dropped rather than failing the run — the
        // next one is usually the terminal message anyway.
        return
      }
      latest.current.onEvent(iid, runId, event)
      // The server closes after the terminal payload; closing on this side too
      // is what stops `EventSource` from reconnecting to a finished run.
      if (event.kind === 'report' || event.kind === 'failed') close()
      else if (event.kind === 'phase' && event.phase === 'interrupted') close()
    })

    source.addEventListener('error', () => {
      // Either the run is gone (404) or the connection dropped. Both mean "no
      // one is watching this run any more", which is what `onLost` says.
      close()
      latest.current.onLost(iid, runId)
    })

    return close
  }, [iid, runId])
}

/** The two mutations, behind the coordinator's hooks. */
export function useExplainActions(): {
  start: (iid: number, issueKey?: string) => Promise<StartExplainResult>
  close: (iid: number) => Promise<CloseExplainResult>
  isStarting: boolean
  isClosing: boolean
} {
  const { start, isPending: isStarting } = useStartExplain()
  const { close, isPending: isClosing } = useCloseExplain()
  return { start, close, isStarting, isClosing }
}

/**
 * The whole-diff fetch, as the move page sees it (ADR-0010 §6).
 *
 * `idle` is a real state, not a placeholder: this is the one query in the app
 * that must not run until the reader asks for it, so "nobody has asked" has to
 * be distinguishable from "asked and waiting".
 */
export type ExplainDiffState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      /** The commit GitLab answered for — not necessarily the report's. */
      readonly headSha: string
      readonly files: readonly ExplainDiffFile[]
    }
  | { readonly status: 'failed'; readonly message: string }

/**
 * One merge request's diff, fetched only once `wanted` names it.
 *
 * The gate is the iid rather than a boolean, so switching tabs cannot leave the
 * previous tab's "yes, fetch it" applied to the new one. Once fetched it is
 * cached per merge request, so every move's expander on that report is free.
 */
export function useExplainDiffState(wanted: number | null): ExplainDiffState {
  const query = useExplainDiffs(wanted)
  if (wanted === null) return { status: 'idle' }
  if (query.isPending) return { status: 'loading' }
  if (query.data === undefined) {
    return {
      status: 'failed',
      message:
        query.error instanceof Error
          ? query.error.message
          : 'could not read the merge request’s diff',
    }
  }
  if (!query.data.ok) return { status: 'failed', message: query.data.error.message }
  return { status: 'ready', headSha: query.data.headSha, files: query.data.files }
}
