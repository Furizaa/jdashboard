import type { RawIssue, RawSearchResponse } from '~/server/jira/gateway'

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

export class World {
  private readonly issues: RawIssue[] = []
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
