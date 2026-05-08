import type { RawIssue } from '~/server/jira/gateway'
import type { WorldUser } from '../world/World'

let issueCounter = 100
let userCounter = 0

type IssueOverrides = {
  key?: string
  summary?: string
  statusName?: string
  typeName?: string
  labels?: readonly string[]
  parent?: { key: string; summary: string; issuetype?: string } | null
}

export function makeIssue(overrides: IssueOverrides = {}): RawIssue {
  const n = ++issueCounter
  const key = overrides.key ?? `HDR-${n}`
  const statusName = overrides.statusName ?? 'In Implementation'
  return {
    id: String(n),
    key,
    fields: {
      summary: overrides.summary ?? `${key}: Lorem placeholder`,
      status: {
        name: statusName,
        statusCategory: { key: 'indeterminate', name: 'In Progress' },
      },
      labels: overrides.labels ? [...overrides.labels] : [],
      issuetype: { name: overrides.typeName ?? 'Task' },
      parent: overrides.parent
        ? {
            key: overrides.parent.key,
            fields: {
              summary: overrides.parent.summary,
              issuetype: { name: overrides.parent.issuetype ?? 'Epic' },
            },
          }
        : null,
    },
  }
}

export function makeUser(overrides: Partial<WorldUser> = {}): WorldUser {
  const n = ++userCounter
  return {
    accountId: overrides.accountId ?? `acct-${n}`,
    displayName: overrides.displayName ?? `Test User ${n}`,
    avatarUrls: overrides.avatarUrls ?? {
      '48x48': 'http://127.0.0.1:9999/avatar.png',
      '32x32': 'http://127.0.0.1:9999/avatar.png',
      '24x24': 'http://127.0.0.1:9999/avatar.png',
    },
  }
}
