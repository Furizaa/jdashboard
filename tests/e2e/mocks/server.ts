import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { delay, getResponse, http, HttpResponse, type HttpHandler } from 'msw'
import { World, seedBaselineWorld } from '../world/World'
import { buildHandlers } from './handlers'

export type RequestLogEntry = {
  method: string
  /** URL pathname (no host, no query string). */
  path: string
}

export type FailNextResponse = {
  status: number
  body?: unknown
  /**
   * Hold the response for this many real-time milliseconds before resolving.
   * Lets specs observe in-flight UI states (e.g. an optimistic update) before
   * the failure response triggers a rollback.
   */
  delayMs?: number
}

export type MockServer = {
  start: (port: number) => Promise<void>
  stop: () => Promise<void>
  setWorld: (world: World) => void
  getWorld: () => World
  /** Register handler overrides for the current test. Call `reset()` to clear them. */
  use: (...overrides: HttpHandler[]) => void
  /** Register a one-shot override that fires for the next matching request and is then dropped. */
  failNext: (method: 'GET' | 'POST' | 'PUT' | 'DELETE', pattern: string, response: FailNextResponse) => void
  /** Snapshot of all requests served since the last `reset()`. */
  requests: () => readonly RequestLogEntry[]
  reset: () => void
}

export function createMockServer(): MockServer {
  let currentWorld: World | null = null
  let overrides: HttpHandler[] = []
  let oneShots: HttpHandler[] = []
  let requestLog: RequestLogEntry[] = []
  const baseHandlers = buildHandlers(() => {
    if (currentWorld === null) {
      throw new Error('MockServer: no World has been set. Call setWorld() before serving.')
    }
    return currentWorld
  })

  let server: Server | null = null

  async function handleRequest(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
    try {
      const host = incoming.headers.host ?? '127.0.0.1:9999'
      const url = `http://${host}${incoming.url ?? '/'}`
      const headers = new Headers()
      for (const [key, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const v of value) headers.append(key, v)
        else if (value !== undefined) headers.set(key, value)
      }
      const init: RequestInit = { method: incoming.method ?? 'GET', headers }
      if (incoming.method && incoming.method !== 'GET' && incoming.method !== 'HEAD') {
        const chunks: Buffer[] = []
        for await (const chunk of incoming) chunks.push(chunk as Buffer)
        init.body = Buffer.concat(chunks)
      }
      const request = new Request(url, init)

      try {
        const parsed = new URL(url)
        requestLog.push({ method: init.method ?? 'GET', path: parsed.pathname })
      } catch {
        requestLog.push({ method: init.method ?? 'GET', path: incoming.url ?? '/' })
      }

      // One-shots are matched first; the first that matches is consumed.
      const oneShotMatches = await Promise.all(
        oneShots.map((h) => getResponse([h], request)),
      )
      const oneShotIdx = oneShotMatches.findIndex((m): m is Response => m != null)
      let matched: Response | undefined
      if (oneShotIdx !== -1) {
        matched = oneShotMatches[oneShotIdx]
        oneShots.splice(oneShotIdx, 1)
      } else {
        const handlers = [...overrides, ...baseHandlers]
        matched = await getResponse(handlers, request)
      }

      if (!matched) {
        response.statusCode = 501
        response.setHeader('content-type', 'text/plain; charset=utf-8')
        response.end(`MockServer: no handler for ${incoming.method} ${incoming.url}`)
        return
      }

      response.statusCode = matched.status
      matched.headers.forEach((value, key) => {
        // `content-encoding` from a fetch Response is misleading on a plain
        // node:http response stream — skip transport-layer headers.
        if (key.toLowerCase() === 'content-encoding') return
        response.setHeader(key, value)
      })
      const body = matched.body ? Buffer.from(await matched.arrayBuffer()) : null
      if (body) response.end(body)
      else response.end()
    } catch (err) {
      response.statusCode = 500
      response.setHeader('content-type', 'text/plain; charset=utf-8')
      response.end(err instanceof Error ? err.stack ?? err.message : String(err))
    }
  }

  return {
    async start(port) {
      if (server !== null) throw new Error('MockServer: already started')
      const s = createServer((req, res) => {
        void handleRequest(req, res)
      })
      await new Promise<void>((resolve, reject) => {
        s.once('error', reject)
        s.listen(port, '127.0.0.1', () => {
          s.off('error', reject)
          resolve()
        })
      })
      server = s
    },
    async stop() {
      if (server === null) return
      const s = server
      server = null
      await new Promise<void>((resolve, reject) => {
        s.close((err) => (err ? reject(err) : resolve()))
      })
    },
    setWorld(world) {
      currentWorld = world
    },
    getWorld() {
      if (currentWorld === null) throw new Error('MockServer: no World set')
      return currentWorld
    },
    use(...handlers) {
      overrides = [...handlers, ...overrides]
    },
    failNext(method, pattern, fail) {
      const resolver = async () => {
        if (fail.delayMs !== undefined) await delay(fail.delayMs)
        return new HttpResponse(fail.body === undefined ? null : JSON.stringify(fail.body), {
          status: fail.status,
          headers: fail.body === undefined ? undefined : { 'content-type': 'application/json' },
        })
      }
      const m = method.toLowerCase() as Lowercase<typeof method>
      const handler = http[m](pattern, resolver)
      oneShots.push(handler)
    },
    requests() {
      return requestLog
    },
    reset() {
      overrides = []
      oneShots = []
      requestLog = []
    },
  }
}

export const mockServer = createMockServer()

export { World, seedBaselineWorld }
