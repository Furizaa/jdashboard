import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { createIssue, transitionIssue } from '~/server/jira'
import { createBrowserWindowAdapter } from './adapters/browser-window'
import { createRouterNavigateAdapter } from './adapters/router-navigate'
import { createSonnerToastAdapter } from './adapters/sonner-toast'
import { createTanstackCacheAdapter } from './adapters/tanstack-cache'
import { createCoordinator, type Coordinator } from './coordinator'

const CREATE_ISSUE_TIMEOUT_MS = 10_000

const CoordinatorCtx = createContext<Coordinator | null>(null)

export function useCoordinator(): Coordinator {
  const coord = useContext(CoordinatorCtx)
  if (coord === null) {
    throw new Error('useCoordinator called outside <CoordinatorProvider>')
  }
  return coord
}

export function CoordinatorProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const coord = useMemo(() => {
    return createCoordinator({
      cache: createTanstackCacheAdapter(queryClient),
      toast: createSonnerToastAdapter(),
      navigate: createRouterNavigateAdapter(navigate),
      browser: createBrowserWindowAdapter(),
      jira: { transitionIssue, createIssue },
      clock: () => Date.now(),
      setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
      clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
      createIssueTimeoutMs: CREATE_ISSUE_TIMEOUT_MS,
    })
  }, [queryClient, navigate])

  return <CoordinatorCtx.Provider value={coord}>{children}</CoordinatorCtx.Provider>
}
