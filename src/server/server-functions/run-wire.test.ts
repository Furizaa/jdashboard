import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { Effect, Schema } from 'effect'

const REQUIRED_ENV: Record<string, string> = {
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'test@example.com',
  JIRA_API_TOKEN: 'token',
  JIRA_PROJECT_KEY: 'TEST',
  JIRA_LABEL_FILTER: 'Frontend',
  JIRA_DONE_WINDOW_DAYS: '14',
  GITLAB_BASE_URL: 'https://gitlab.example.com',
  GITLAB_TOKEN: 'gltoken',
  GITLAB_PROJECT_PATH: 'group/proj',
}

beforeAll(() => {
  for (const [key, value] of Object.entries(REQUIRED_ENV)) {
    vi.stubEnv(key, value)
  }
})

afterAll(() => {
  vi.unstubAllEnvs()
})

class Rejected extends Schema.TaggedError<Rejected>()('Rejected', {
  message: Schema.String,
}) {}

const ErrorUnion = Schema.Union(Rejected)

describe('runWire', () => {
  it('passes through a success program as { ok: true, ...payload }', async () => {
    const { runWire } = await import('./run-wire')
    const program = Effect.succeed({ items: [1, 2], total: 2 })
    const result = await runWire(program, ErrorUnion, 'success-test')
    expect(result).toEqual({ ok: true, items: [1, 2], total: 2 })
  })

  it('throws an Error containing the label when the program defects', async () => {
    const { runWire } = await import('./run-wire')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const program: Effect.Effect<{ items: ReadonlyArray<number> }, Rejected, never> = Effect.die(
      new Error('boom'),
    )
    await expect(runWire(program, ErrorUnion, 'defect-test')).rejects.toThrow(
      /defect-test: internal error/,
    )
    consoleError.mockRestore()
  })
})
