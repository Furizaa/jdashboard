import { test as base, type Page } from '@playwright/test'
import {
  mockServer,
  type MockServer,
  type RequestLogEntry,
  type FailNextResponse,
} from '../mocks/server'
import { World, seedBaselineWorld } from '../world/World'
import { LocalStore } from './local-store'
import type { HttpHandler } from 'msw'

export type MocksHandle = {
  /** Register handler overrides for the current test. Cleared automatically between tests. */
  use: (...handlers: HttpHandler[]) => void
  /** Register a one-shot override; fires once for the next matching request and is then dropped. */
  failNext: (
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    pattern: string,
    response: FailNextResponse,
  ) => void
  /** Snapshot of all requests the sidecar has served since this test started. */
  requests: () => readonly RequestLogEntry[]
}

type TestFixtures = {
  world: World
  mocks: MocksHandle
  /** The app's local-only state (tags, watchlist) on the e2e server's disk. */
  local: LocalStore
}

type WorkerFixtures = {
  mockServerHandle: MockServer
}

const FIXED_TIME = new Date('2026-05-08T12:00:00Z')
const MOCK_PORT = 9999

// Per-worker fixture: start the MSW sidecar in the same Node process the
// tests run in, so `setWorld` writes are visible to the HTTP listener.
// (A globalSetup-scoped server would run in a different process and the
// worker's setWorld would write to a separate module instance.)
export const test = base.extend<TestFixtures, WorkerFixtures>({
  mockServerHandle: [
    // Playwright requires fixture functions to take a destructuring pattern;
    // this fixture has no upstream dependencies so the pattern is empty.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await mockServer.start(MOCK_PORT)
      await use(mockServer)
      await mockServer.stop()
    },
    { scope: 'worker', auto: true },
  ],
  world: async ({ page, mockServerHandle }: { page: Page; mockServerHandle: MockServer }, use) => {
    const world = new World()
    seedBaselineWorld(world)
    mockServerHandle.setWorld(world)
    await page.clock.install({ time: FIXED_TIME })
    await use(world)
    mockServerHandle.reset()
  },
  // Auto-used so every spec starts from an empty `~/.clashboard`, whether or not
  // it seeds anything: otherwise one spec's tags would leak into the next.
  local: [
    // Playwright requires a destructuring pattern; this fixture has no upstream
    // dependencies, so the pattern is empty (as with `mockServerHandle` above).
    // eslint-disable-next-line no-empty-pattern
    // oxlint-disable-next-line no-empty-pattern
    async ({}, use) => {
      const store = new LocalStore()
      await store.reset()
      await use(store)
      await store.reset()
    },
    { auto: true },
  ],
  mocks: async ({ mockServerHandle, world: _world }, use) => {
    await use({
      use: (...handlers) => mockServerHandle.use(...handlers),
      failNext: (method, pattern, response) => mockServerHandle.failNext(method, pattern, response),
      requests: () => mockServerHandle.requests(),
    })
  },
})

export { expect } from '@playwright/test'
