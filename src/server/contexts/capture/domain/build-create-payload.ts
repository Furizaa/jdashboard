import type { CreateIssueBody } from '../../../gateways/jira/types'
import { plainTextToAdf } from './plain-text-to-adf'

export type CreatePayloadForm = {
  readonly type: string
  readonly summary: string
  readonly description: string
  readonly parentKey: string
}

export type CreatePayloadConfig = {
  readonly summaryPrefix: string
  readonly labels: readonly string[]
  readonly priority: string
}

export function buildCreatePayload(input: {
  form: CreatePayloadForm
  currentUser: { accountId: string }
  projectKey: string
  config: CreatePayloadConfig
}): CreateIssueBody {
  const { form, currentUser, projectKey, config } = input
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: form.type },
      summary: `${config.summaryPrefix}${form.summary}`,
      description: plainTextToAdf(form.description),
      priority: { name: config.priority },
      labels: [...config.labels],
      parent: { key: form.parentKey },
      assignee: { accountId: currentUser.accountId },
    },
  }
}
