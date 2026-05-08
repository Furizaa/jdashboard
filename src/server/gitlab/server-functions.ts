import { createServerFn } from '@tanstack/react-start'
import { createHttpGitlabGateway } from './http-gateway'
import { createGitlabMrService, type GitlabMrService } from './mr-service'
import { createGitlabReviewService, type GitlabReviewService } from './review-service'
import { getJiraService } from '~/server/jira/server-functions'
import { getServerEnv } from '~/server/env'

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
    cachedReview = createGitlabReviewService(gateway, getJiraService(), {
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
