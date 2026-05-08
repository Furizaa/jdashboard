import type {
  AdfNode,
  RawDetailedIssue,
  RawIssue,
  RawLinkedRef,
  RawSearchResponse,
} from '~/server/jira/gateway'

export type WorldUser = {
  accountId: string
  displayName: string
  avatarUrls: Record<string, string>
}

export type WorldTransition = {
  id: string
  name: string
  toStatusName: string
}

export type WorldComment = {
  id: string
  authorName?: string | null
  authorAvatarUrl?: string | null
  created: string
  body: AdfNode | null
}

export type WorldIssueLink = {
  id: string
  type: { name: string; inward: string; outward: string }
  inwardIssue?: RawLinkedRef
  outwardIssue?: RawLinkedRef
}

export type WorldSubtask = {
  key: string
  summary?: string
  statusName?: string
  /** Drives the n-done/m-total chip; default 'indeterminate' (not done). */
  statusCategory?: 'new' | 'indeterminate' | 'done'
  typeName?: string
}

export type IssueDetailExtras = {
  description?: AdfNode | null
  parent?: RawLinkedRef | null
  comments?: WorldComment[]
  issuelinks?: WorldIssueLink[]
  /** Convenience: also seeded as RawIssues with parent.key set to the issue key. */
  subtasks?: WorldSubtask[]
}

export class World {
  private readonly issues: RawIssue[] = []
  private readonly issueDetail = new Map<string, IssueDetailExtras>()
  private readonly transitions = new Map<string, WorldTransition[]>()
  private myself: WorldUser = {
    accountId: 'e2e-account',
    displayName: 'E2E User',
    avatarUrls: {
      '48x48': 'http://127.0.0.1:9999/avatar.png',
      '32x32': 'http://127.0.0.1:9999/avatar.png',
      '24x24': 'http://127.0.0.1:9999/avatar.png',
    },
  }

  seedIssues(issues: readonly RawIssue[]): void {
    for (const issue of issues) {
      const idx = this.issues.findIndex((i) => i.key === issue.key)
      if (idx === -1) this.issues.push(issue)
      else this.issues[idx] = issue
    }
  }

  removeIssue(key: string): void {
    const idx = this.issues.findIndex((i) => i.key === key)
    if (idx !== -1) this.issues.splice(idx, 1)
  }

  setMyself(user: WorldUser): void {
    this.myself = user
  }

  getMyself(): WorldUser {
    return this.myself
  }

  seedTransitions(issueKey: string, transitions: readonly WorldTransition[]): void {
    this.transitions.set(issueKey, transitions.map((t) => ({ ...t })))
  }

  getTransitions(issueKey: string): WorldTransition[] {
    return this.transitions.get(issueKey) ?? []
  }

  transitionIssue(issueKey: string, transitionId: string): string {
    const allowed = this.transitions.get(issueKey) ?? []
    const transition = allowed.find((t) => t.id === transitionId)
    if (transition === undefined) {
      throw new Error(
        `World.transitionIssue: no transition '${transitionId}' seeded for ${issueKey}`,
      )
    }
    const issue = this.issues.find((i) => i.key === issueKey)
    if (issue === undefined) {
      throw new Error(`World.transitionIssue: no issue seeded with key ${issueKey}`)
    }
    issue.fields.status = {
      ...issue.fields.status,
      name: transition.toStatusName,
    }
    return transition.toStatusName
  }

  seedIssueDetail(key: string, extras: IssueDetailExtras): void {
    const existing = this.issueDetail.get(key) ?? {}
    this.issueDetail.set(key, { ...existing, ...extras })
    if (extras.subtasks) {
      const parent = this.issues.find((i) => i.key === key)
      const parentSummary = parent?.fields.summary ?? key
      const parentType = parent?.fields.issuetype?.name ?? 'Task'
      const subIssues: RawIssue[] = extras.subtasks.map((s, idx) => ({
        id: `sub-${key}-${idx}`,
        key: s.key,
        fields: {
          summary: s.summary ?? `${s.key} sub-issue`,
          status: {
            name: s.statusName ?? 'In Implementation',
            statusCategory: {
              key: s.statusCategory ?? 'indeterminate',
              name: s.statusCategory === 'done' ? 'Done' : 'In Progress',
            },
          },
          labels: [],
          issuetype: { name: s.typeName ?? 'Task' },
          parent: {
            key,
            fields: {
              summary: parentSummary,
              issuetype: { name: parentType },
            },
          },
        },
      }))
      this.seedIssues(subIssues)
    }
  }

  getIssueDetail(key: string): RawDetailedIssue | null {
    const issue = this.issues.find((i) => i.key === key)
    if (issue === undefined) return null
    const extras = this.issueDetail.get(key) ?? {}
    return {
      id: issue.id,
      key: issue.key,
      fields: {
        summary: issue.fields.summary,
        status: { name: issue.fields.status.name },
        issuetype: issue.fields.issuetype,
        labels: issue.fields.labels ?? [],
        priority: null,
        assignee: null,
        reporter: null,
        description: extras.description ?? null,
        parent: extras.parent !== undefined ? extras.parent : (issue.fields.parent ?? null),
        issuelinks: extras.issuelinks ?? [],
        comment: {
          comments: (extras.comments ?? []).map((c) => ({
            id: c.id,
            author:
              c.authorName != null
                ? {
                    displayName: c.authorName,
                    avatarUrls:
                      c.authorAvatarUrl != null ? { '48x48': c.authorAvatarUrl } : undefined,
                  }
                : null,
            created: c.created,
            body: c.body,
          })),
        },
      },
    }
  }

  searchIssues(jql: string): RawSearchResponse {
    const trimmed = jql.trim()
    let issues: RawIssue[]

    const parentMatch = /parent\s*=\s*"([^"]+)"/i.exec(trimmed)
    if (parentMatch) {
      const parentKey = parentMatch[1]
      issues = this.issues.filter((i) => i.fields.parent?.key === parentKey)
    } else {
      const keyInMatch = /key\s+in\s*\(([^)]+)\)/i.exec(trimmed)
      if (keyInMatch) {
        const requestedKeys = new Set(
          keyInMatch[1]!
            .split(',')
            .map((s) => s.trim().replace(/^"|"$/g, ''))
            .filter((s) => s.length > 0),
        )
        issues = this.issues.filter((i) => requestedKeys.has(i.key))
      } else {
        issues = this.issues.slice()
      }
    }

    return { issues, isLast: true }
  }
}

export function seedBaselineWorld(world: World): void {
  world.setMyself({
    accountId: 'e2e-account',
    displayName: 'E2E User',
    avatarUrls: {
      '48x48': 'http://127.0.0.1:9999/avatar.png',
      '32x32': 'http://127.0.0.1:9999/avatar.png',
      '24x24': 'http://127.0.0.1:9999/avatar.png',
    },
  })
}
