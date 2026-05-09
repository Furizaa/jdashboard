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

export const getMyself = createServerFn({ method: 'GET' }).handler(() => service().getMyself())

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
