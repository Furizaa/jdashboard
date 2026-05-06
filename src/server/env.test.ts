import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const REQUIRED = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY',
  'JIRA_LABEL_FILTER',
  'JIRA_DONE_WINDOW_DAYS',
] as const

const VALID_ENV = {
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'a@b.com',
  JIRA_API_TOKEN: 'token',
  JIRA_PROJECT_KEY: 'HDR',
  JIRA_LABEL_FILTER: 'Frontend',
  JIRA_DONE_WINDOW_DAYS: '14',
}

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const key of REQUIRED) delete process.env[key]
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of REQUIRED) delete process.env[key]
  Object.assign(process.env, originalEnv)
})

async function loadEnv() {
  const mod = await import('./env')
  return mod.getServerEnv()
}

describe('getServerEnv', () => {
  it('parses a complete valid environment', async () => {
    Object.assign(process.env, VALID_ENV)
    const env = await loadEnv()
    expect(env.JIRA_BASE_URL).toBe('https://example.atlassian.net')
    expect(env.JIRA_DONE_WINDOW_DAYS).toBe(14)
  })

  it('strips a trailing slash from JIRA_BASE_URL', async () => {
    Object.assign(process.env, VALID_ENV, { JIRA_BASE_URL: 'https://example.atlassian.net/' })
    const env = await loadEnv()
    expect(env.JIRA_BASE_URL).toBe('https://example.atlassian.net')
  })

  for (const key of REQUIRED) {
    it(`throws when ${key} is missing`, async () => {
      Object.assign(process.env, VALID_ENV)
      delete process.env[key]
      await expect(loadEnv()).rejects.toThrow(/Missing or empty/)
    })

    it(`throws when ${key} is empty`, async () => {
      Object.assign(process.env, VALID_ENV, { [key]: '   ' })
      await expect(loadEnv()).rejects.toThrow(/Missing or empty/)
    })
  }

  it('throws when JIRA_DONE_WINDOW_DAYS is not a number', async () => {
    Object.assign(process.env, VALID_ENV, { JIRA_DONE_WINDOW_DAYS: 'foo' })
    await expect(loadEnv()).rejects.toThrow(/non-negative integer/)
  })
})
