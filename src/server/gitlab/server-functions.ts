import { createServerFn } from '@tanstack/react-start'
import { gitlabClient, GitlabAuthError } from './client'
import { buildMrKeyMap } from './mr-key-map'
import { summarizeMr, type MrSummary } from './mr-status'
import { getServerEnv } from '~/server/env'

export type GetGitlabUserResult =
  | { ok: true; username: string; displayName: string }
  | { ok: false; reason: 'unauthorized' }

export const getGitlabUser = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetGitlabUserResult> => {
    try {
      const user = await gitlabClient.getCurrentUser()
      return { ok: true, username: user.username, displayName: user.name }
    } catch (err) {
      if (err instanceof GitlabAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  },
)

export type GetMrStatusesResult =
  | { ok: true; byKey: Record<string, MrSummary> }
  | { ok: false; reason: 'unauthorized' }

export const getMrStatuses = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMrStatusesResult> => {
    const env = getServerEnv()
    try {
      const currentUser = await gitlabClient.getCurrentUser()
      const updatedAfter = new Date(
        Date.now() - env.JIRA_DONE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
      )

      const mrs = await gitlabClient.listMrs({
        state: ['opened', 'merged'],
        updatedAfter,
        authorUsername: currentUser.username,
      })
      const matched = buildMrKeyMap(mrs, env.JIRA_PROJECT_KEY)

      const entries = Object.entries(matched)
      const summaries = await Promise.all(
        entries.map(async ([key, mr]) => {
          const [detail, discussions, approvals] = await Promise.all([
            gitlabClient.getMr(mr.iid),
            gitlabClient.getMrDiscussions(mr.iid),
            gitlabClient.getMrApprovals(mr.iid),
          ])
          const approvedUsernames = new Set(approvals.approved_by.map((a) => a.user.username))
          return [
            key,
            summarizeMr(detail, discussions, approvedUsernames, currentUser.username),
          ] as const
        }),
      )

      const byKey: Record<string, MrSummary> = {}
      for (const [key, summary] of summaries) {
        byKey[key] = summary
      }
      return { ok: true, byKey }
    } catch (err) {
      if (err instanceof GitlabAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  },
)
