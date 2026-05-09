import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readServerEnv } from './server-env'

const REQUIRED = [
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
  'JIRA_PROJECT_KEY',
  'JIRA_LABEL_FILTER',
  'JIRA_DONE_WINDOW_DAYS',
  'GITLAB_BASE_URL',
  'GITLAB_TOKEN',
  'GITLAB_PROJECT_PATH',
] as const

const VALID_ENV = {
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'a@b.com',
  JIRA_API_TOKEN: 'token',
  JIRA_PROJECT_KEY: 'HDR',
  JIRA_LABEL_FILTER: 'Frontend',
  JIRA_DONE_WINDOW_DAYS: '14',
  GITLAB_BASE_URL: 'https://gitlab.com',
  GITLAB_TOKEN: 'glpat-xxx',
  GITLAB_PROJECT_PATH: 'group/project',
}

const originalEnv = { ...process.env }

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  for (const key of REQUIRED) delete process.env[key]
  delete process.env.JIRA_HIDE_LABELS
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of REQUIRED) delete process.env[key]
  delete process.env.JIRA_HIDE_LABELS
  Object.assign(process.env, originalEnv)
})

describe('readServerEnv', () => {
  it('parses a complete valid environment', () => {
    Object.assign(process.env, VALID_ENV)
    const env = readServerEnv()
    expect(env.JIRA_BASE_URL).toBe('https://example.atlassian.net')
    expect(env.JIRA_DONE_WINDOW_DAYS).toBe(14)
  })

  it('strips a trailing slash from JIRA_BASE_URL', () => {
    Object.assign(process.env, VALID_ENV, { JIRA_BASE_URL: 'https://example.atlassian.net/' })
    expect(readServerEnv().JIRA_BASE_URL).toBe('https://example.atlassian.net')
  })

  it('strips a trailing slash from GITLAB_BASE_URL', () => {
    Object.assign(process.env, VALID_ENV, { GITLAB_BASE_URL: 'https://gitlab.com/' })
    expect(readServerEnv().GITLAB_BASE_URL).toBe('https://gitlab.com')
  })

  for (const key of REQUIRED) {
    it(`throws when ${key} is missing`, () => {
      Object.assign(process.env, VALID_ENV)
      delete process.env[key]
      expect(() => readServerEnv()).toThrow(/Missing or empty/)
    })

    it(`throws when ${key} is empty`, () => {
      Object.assign(process.env, VALID_ENV, { [key]: '   ' })
      expect(() => readServerEnv()).toThrow(/Missing or empty/)
    })
  }

  it('throws when JIRA_DONE_WINDOW_DAYS is not a number', () => {
    Object.assign(process.env, VALID_ENV, { JIRA_DONE_WINDOW_DAYS: 'foo' })
    expect(() => readServerEnv()).toThrow(/non-negative integer/)
  })
})
