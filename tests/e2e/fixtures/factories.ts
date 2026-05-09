import type { RawIssue } from '~/server/gateways/jira'
import type {
  GitlabApprovals,
  GitlabDiscussion,
  GitlabDiscussionNote,
  GitlabMr,
  GitlabMrReviewer,
  GitlabPipeline,
  GitlabReviewerEndpointState,
  GitlabUser,
  WorldUser,
} from '../world/World'

let issueCounter = 100
let userCounter = 0
let mrIidCounter = 1000
let discussionCounter = 0

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

export function makeGitlabUser(overrides: Partial<GitlabUser> = {}): GitlabUser {
  return {
    username: overrides.username ?? 'e2e-gitlab',
    displayName: overrides.displayName ?? 'E2E GitLab User',
  }
}

type MrOverrides = {
  iid?: number
  jiraKey?: string
  title?: string
  webUrl?: string
  state?: GitlabMr['state']
  draft?: boolean
  updatedAt?: string
  authorUsername?: string
}

export function makeMr(overrides: MrOverrides = {}): GitlabMr {
  const iid = overrides.iid ?? ++mrIidCounter
  const jiraKey = overrides.jiraKey ?? `HDR-${iid}`
  const title = overrides.title ?? `${jiraKey}: Lorem placeholder MR`
  return {
    iid,
    title,
    webUrl: overrides.webUrl ?? `https://gitlab.example/group/proj/-/merge_requests/${iid}`,
    state: overrides.state ?? 'opened',
    draft: overrides.draft ?? false,
    updatedAt: overrides.updatedAt ?? '2026-05-08T10:00:00Z',
    authorUsername: overrides.authorUsername ?? 'e2e-gitlab',
  }
}

export function makeMrReviewer(overrides: Partial<GitlabMrReviewer> = {}): GitlabMrReviewer {
  const username = overrides.username ?? `reviewer-${++userCounter}`
  return {
    username,
    displayName: overrides.displayName ?? `Reviewer ${username}`,
    avatarUrl: overrides.avatarUrl === undefined ? null : overrides.avatarUrl,
    state: overrides.state ?? 'unreviewed',
  }
}

type DiscussionOverrides = {
  id?: string
  notes?: ReadonlyArray<Partial<GitlabDiscussionNote>>
}

function note(overrides: Partial<GitlabDiscussionNote>): GitlabDiscussionNote {
  return {
    authorUsername: overrides.authorUsername ?? 'someone-else',
    resolvable: overrides.resolvable ?? true,
    resolved: overrides.resolved ?? false,
    system: overrides.system ?? false,
  }
}

export function makeDiscussion(overrides: DiscussionOverrides = {}): GitlabDiscussion {
  const id = overrides.id ?? `disc-${++discussionCounter}`
  const notes = (overrides.notes ?? [{}]).map(note)
  return { id, notes }
}

export function makeApprovals(overrides: Partial<GitlabApprovals> = {}): GitlabApprovals {
  return { approvedUsernames: overrides.approvedUsernames ?? [] }
}

export function makePipeline(overrides: Partial<GitlabPipeline> = {}): GitlabPipeline {
  return {
    status: overrides.status === undefined ? null : overrides.status,
    hasConflicts: overrides.hasConflicts ?? false,
  }
}

export type {
  GitlabApprovals,
  GitlabDiscussion,
  GitlabDiscussionNote,
  GitlabMr,
  GitlabMrReviewer,
  GitlabPipeline,
  GitlabReviewerEndpointState,
  GitlabUser,
}
