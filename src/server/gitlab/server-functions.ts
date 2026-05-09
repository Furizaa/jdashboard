import { createServerFn } from '@tanstack/react-start'
import { createHttpGitlabGateway } from './http-gateway'
import { createGitlabMrService, type GitlabMrService } from './mr-service'
import { createGitlabReviewService, type GitlabReviewService } from './review-service'
import { defaultEpicConfig, defaultQuickCreateConfig } from '~/server/jira/config'
import { createHttpJiraGateway } from '~/server/jira/http-gateway'
import { createJiraIssueService, type JiraIssueService } from '~/server/jira/issue-service'
import { getServerEnv } from '~/server/env'

let cachedJira: JiraIssueService | null = null

function jiraService(): JiraIssueService {
  if (cachedJira === null) {
    const env = getServerEnv()
    const gateway = createHttpJiraGateway({
      baseUrl: env.JIRA_BASE_URL,
      email: env.JIRA_EMAIL,
      apiToken: env.JIRA_API_TOKEN,
    })
    cachedJira = createJiraIssueService(gateway, {
      baseUrl: env.JIRA_BASE_URL,
      projectKey: env.JIRA_PROJECT_KEY,
      labelFilter: env.JIRA_LABEL_FILTER,
      hideLabels: env.JIRA_HIDE_LABELS,
      doneWindowDays: env.JIRA_DONE_WINDOW_DAYS,
      quickCreate: defaultQuickCreateConfig,
      epic: defaultEpicConfig,
    })
  }
  return cachedJira
}

let cachedMr: GitlabMrService | null = null
let cachedReview: GitlabReviewService | null = null

function service(): GitlabMrService {
  if (cachedMr === null) {
    const env = getServerEnv()
    const gateway = createHttpGitlabGateway({
      baseUrl: env.GITLAB_BASE_URL,
      token: env.GITLAB_TOKEN,
      projectPath: env.GITLAB_PROJECT_PATH,
    })
    cachedMr = createGitlabMrService(gateway, {
      jiraProjectKey: env.JIRA_PROJECT_KEY,
      lookbackDays: env.JIRA_DONE_WINDOW_DAYS,
      defaultStates: ['opened', 'merged'],
      clock: () => new Date(),
    })
  }
  return cachedMr
}

function reviewService(): GitlabReviewService {
  if (cachedReview === null) {
    const env = getServerEnv()
    const gateway = createHttpGitlabGateway({
      baseUrl: env.GITLAB_BASE_URL,
      token: env.GITLAB_TOKEN,
      projectPath: env.GITLAB_PROJECT_PATH,
    })
    cachedReview = createGitlabReviewService(gateway, jiraService(), {
      jiraProjectKey: env.JIRA_PROJECT_KEY,
      lookbackDays: env.JIRA_DONE_WINDOW_DAYS,
      clock: () => new Date(),
    })
  }
  return cachedReview
}

export const getGitlabUser = createServerFn({ method: 'GET' }).handler(() =>
  service().getCurrentUser(),
)
export const getMrStatuses = createServerFn({ method: 'GET' }).handler(() =>
  service().getMrStatuses(),
)
export const getReviewCards = createServerFn({ method: 'GET' }).handler(() =>
  reviewService().getReviewCards(),
)
