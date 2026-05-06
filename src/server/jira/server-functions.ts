import { createServerFn } from '@tanstack/react-start'
import { jiraClient, JiraAuthError } from './client'

export type GetMyselfResult =
  | { ok: true; user: { accountId: string; displayName: string; avatarUrl: string } }
  | { ok: false; reason: 'unauthorized' }

export const getMyself = createServerFn({ method: 'GET' }).handler(
  async (): Promise<GetMyselfResult> => {
    try {
      const me = await jiraClient.getMyself()
      const avatarUrl =
        me.avatarUrls['48x48'] ??
        me.avatarUrls['32x32'] ??
        me.avatarUrls['24x24'] ??
        ''
      return {
        ok: true,
        user: {
          accountId: me.accountId,
          displayName: me.displayName,
          avatarUrl,
        },
      }
    } catch (err) {
      if (err instanceof JiraAuthError) {
        return { ok: false, reason: 'unauthorized' }
      }
      throw err
    }
  },
)
