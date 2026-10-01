import { createFileRoute } from '@tanstack/react-router'
import { explainRuns } from '~/server/lib/explain-registry'
import type { ExplainPhase, ExplainRunEvent, ExplainRuns } from '~/server/lib/explain-runs'

// The Explain progress channel: `GET /api/explain/<runId>/stream`, server-sent
// events, one message per activity line or phase change, with the report or the
// failure on the terminal message.
//
// This is ADR-0006's second API route and its **first non-binary** one — which
// is what makes that ADR's "when to use this layer" list read as a list rather
// than as a description of one file. It belongs here and not in
// `server-functions/` for the reason ADR-0006 gives: the response is a stream
// with its own HTTP semantics (`text/event-stream`, a 404 for an unknown id),
// which the JSON-RPC envelope cannot express. Accordingly it imports the run
// registry from `server/lib/` and never `toWire` or a server function.
//
// Raw `stream-json` never reaches the browser: what goes down this channel is
// the registry's own `ExplainRunEvent`, translated once in `explain-agent.ts`.

const TEXT_PLAIN = { 'Content-Type': 'text/plain' } as const

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  // Nginx and friends buffer `text/event-stream` by default, which turns a live
  // log into one burst at the end.
  'X-Accel-Buffering': 'no',
} as const

/** One SSE message. Every payload is JSON, so the client has one parse path. */
export function sseFrame(event: ExplainRunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

const isTerminalPhase = (phase: ExplainPhase): boolean =>
  phase === 'report' || phase === 'failed' || phase === 'interrupted'

/**
 * The run's current state as the events that would have produced it. A client
 * therefore needs no separate read before subscribing, and a reload mid-run
 * replays the whole activity log and lands in the right phase — which is what
 * "a ten-minute run is never lost to a refresh" actually requires.
 */
export function replayFrames(runId: string, runs: ExplainRuns): string[] {
  const run = runs.getRun(runId)
  if (run === null) return []
  const frames = run.activity.map((line) => sseFrame({ kind: 'activity', line }))
  frames.push(sseFrame({ kind: 'phase', phase: run.phase }))
  if (run.report !== null) frames.push(sseFrame({ kind: 'report', report: run.report }))
  if (run.error !== null) frames.push(sseFrame({ kind: 'failed', message: run.error }))
  return frames
}

/**
 * `404` for a run id the registry has never heard of — a reload after a
 * dev-server restart, or a hand-typed URL — so the client falls back to the
 * tab's persisted state instead of waiting on a stream that will never speak.
 * `200 text/event-stream` otherwise.
 */
export function explainStreamResponse(runId: string, runs: ExplainRuns): Response {
  if (runs.getRun(runId) === null) {
    return new Response('No such explain run', { status: 404, headers: TEXT_PLAIN })
  }

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        unsubscribe?.()
        unsubscribe = null
        try {
          controller.close()
        } catch {
          // already closed by the client going away
        }
      }
      const send = (frame: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(frame))
        } catch {
          // the client disconnected mid-write; stop feeding a dead stream
          close()
        }
      }

      // Replay first, then subscribe. Subscribing first would risk delivering an
      // event twice; this order can only ever repeat the current phase, which is
      // idempotent for the client's reducer.
      for (const frame of replayFrames(runId, runs)) send(frame)

      // A run that is already over needs no subscription: the replay above was
      // the whole story.
      const run = runs.getRun(runId)
      if (run !== null && isTerminalPhase(run.phase)) {
        close()
        return
      }

      unsubscribe = runs.subscribe(runId, (event) => {
        send(sseFrame(event))
        // The terminal phase change is the last word; the report or failure that
        // follows it rides on the same event, so closing here would truncate it.
        // Close on the payload instead, or on the phase when there is none.
        if (event.kind === 'report' || event.kind === 'failed') close()
        else if (event.kind === 'phase' && event.phase === 'interrupted') close()
      })
    },
    cancel() {
      unsubscribe?.()
      unsubscribe = null
    },
  })

  return new Response(stream, { status: 200, headers: SSE_HEADERS })
}

export const Route = createFileRoute('/api/explain/$runId/stream')({
  server: {
    handlers: {
      GET: ({ params }) => explainStreamResponse(params.runId, explainRuns),
    },
  },
})
