import type { JiraCreateIssueBody } from './client'
import { plainTextToAdf } from './plain-text-to-adf'
import type { QuickCreateInput } from './quick-create-schema'

export function buildCreatePayload({
  form,
  currentUser,
  projectKey,
}: {
  form: QuickCreateInput
  currentUser: { accountId: string }
  projectKey: string
}): JiraCreateIssueBody {
  return {
    fields: {
      project: { key: projectKey },
      issuetype: { name: form.type },
      summary: `[FE]: ${form.summary}`,
      description: plainTextToAdf(form.description),
      priority: { name: 'Lowest' },
      labels: ['Frontend'],
      parent: { key: form.parentKey },
      assignee: { accountId: currentUser.accountId },
    },
  }
}
