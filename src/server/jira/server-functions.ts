import { createServerFn } from '@tanstack/react-start'
import { defaultEpicConfig, defaultQuickCreateConfig } from './config'
import { createHttpJiraGateway } from './http-gateway'
import { createJiraIssueService, type JiraIssueService } from './issue-service'
import { quickCreateSchema } from './quick-create-schema'
import { getServerEnv } from '~/server/env'

let cached: JiraIssueService | null = null

export function getJiraService(): JiraIssueService {
  if (cached === null) {
    const env = getServerEnv()
    const gateway = createHttpJiraGateway({
      baseUrl: env.JIRA_BASE_URL,
      email: env.JIRA_EMAIL,
      apiToken: env.JIRA_API_TOKEN,
    })
    cached = createJiraIssueService(gateway, {
      baseUrl: env.JIRA_BASE_URL,
      projectKey: env.JIRA_PROJECT_KEY,
      labelFilter: env.JIRA_LABEL_FILTER,
      hideLabels: env.JIRA_HIDE_LABELS,
      doneWindowDays: env.JIRA_DONE_WINDOW_DAYS,
      quickCreate: defaultQuickCreateConfig,
      epic: defaultEpicConfig,
    })
  }
  return cached
}

function service(): JiraIssueService {
  return getJiraService()
}

function requireKey(label: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label}: key is required`)
  }
  return value.trim()
}

export const getMyself = createServerFn({ method: 'GET' }).handler(() => service().getMyself())

export const searchIssues = createServerFn({ method: 'GET' }).handler(() => service().loadBoard())

export const getIssue = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({ key: requireKey('getIssue', data?.key) }))
  .handler(({ data }) => service().loadIssue(data.key))

export const getTransitions = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({ key: requireKey('getTransitions', data?.key) }))
  .handler(({ data }) => service().loadTransitions(data.key))

export const transitionIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; transitionId: string }) => ({
    key: requireKey('transitionIssue', data?.key),
    transitionId: requireKey('transitionIssue (transitionId)', data?.transitionId),
  }))
  .handler(({ data }) => service().performTransition(data.key, data.transitionId))

export const createIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: unknown) => {
    const parsed = quickCreateSchema.safeParse(data)
    if (!parsed.success) {
      throw new Error(`createIssue: invalid input — ${parsed.error.message}`)
    }
    return parsed.data
  })
  .handler(({ data }) => service().quickCreate(data))

export const getMyEpics = createServerFn({ method: 'GET' }).handler(() => service().loadMyEpics())
