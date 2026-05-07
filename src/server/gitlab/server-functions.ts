import { createServerFn } from '@tanstack/react-start'
import { createHttpGitlabGateway } from './http-gateway'
import { createGitlabMrService, type GitlabMrService } from './mr-service'
import { getServerEnv } from '~/server/env'

let cached: GitlabMrService | null = null

function service(): GitlabMrService {
  if (cached === null) {
    const env = getServerEnv()
    const gateway = createHttpGitlabGateway({
      baseUrl: env.GITLAB_BASE_URL,
      token: env.GITLAB_TOKEN,
      projectPath: env.GITLAB_PROJECT_PATH,
    })
    cached = createGitlabMrService(gateway, {
      jiraProjectKey: env.JIRA_PROJECT_KEY,
      lookbackDays: env.JIRA_DONE_WINDOW_DAYS,
      defaultStates: ['opened', 'merged'],
      clock: () => new Date(),
    })
  }
  return cached
}

export const getGitlabUser = createServerFn({ method: 'GET' }).handler(() =>
  service().getCurrentUser(),
)
export const getMrStatuses = createServerFn({ method: 'GET' }).handler(() =>
  service().getMrStatuses(),
)
