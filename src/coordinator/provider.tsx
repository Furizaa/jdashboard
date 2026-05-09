import { useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { createIssue, transitionIssue } from '~/server/jira'
import { createTanstackDashboardCache } from './tanstack-cache'
import { createDashboardService } from './service'
import { DashboardCtx } from './context'

const CREATE_ISSUE_TIMEOUT_MS = 10_000

export function DashboardProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const service = useMemo(() => {
    const cache = createTanstackDashboardCache(queryClient)
    return createDashboardService({
      cache,
      jira: { transitionIssue, createIssue },
      clock: () => Date.now(),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
      createIssueTimeoutMs: CREATE_ISSUE_TIMEOUT_MS,
      toast: { success: toast.success, error: toast.error },
      navigateToIssue: (key) => {
        navigate({ to: '/', search: { issue: key } })
      },
      openInBrowser: (url) => {
        window.open(url, '_blank', 'noopener,noreferrer')
      },
    })
  }, [queryClient, navigate])

  return <DashboardCtx.Provider value={service}>{children}</DashboardCtx.Provider>
}
