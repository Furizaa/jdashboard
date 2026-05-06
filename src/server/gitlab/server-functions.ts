import { createServerFn } from '@tanstack/react-start'
import { gitlabClient, GitlabAuthError } from './client'

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
