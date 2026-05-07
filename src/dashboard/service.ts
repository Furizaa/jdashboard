import type {
  CreateIssueResult,
  GetIssueResult,
  SearchIssuesResult,
  TransitionIssueResult,
} from '~/server/jira'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'
import type { DashboardCache } from './cache'

export type TransitionIssueFn = (args: {
  data: { key: string; transitionId: string }
}) => Promise<TransitionIssueResult>

export type CreateIssueFn = (args: {
  data: QuickCreateInput
  signal?: AbortSignal
}) => Promise<CreateIssueResult>

export type CreateIssueResultWithTimeout =
  | CreateIssueResult
  | { ok: false; reason: 'timed-out'; message: string }

export type HandleMrMergedResult =
  | { ok: true; transitionId: string }
  | {
      ok: false
      reason: 'transitions-failed' | 'no-direct-transition' | 'transition-rejected'
      message?: string
    }

export type ToastOptions = {
  description?: string
  action?: { label: string; onClick: () => void }
  cancel?: { label: string; onClick: () => void }
}
export type ToastFn = (message: string, opts?: ToastOptions) => void

export type DashboardService = {
  applyTransition(input: {
    key: string
    transitionId: string
    toStatusName: string
  }): Promise<TransitionIssueResult>
  createIssue(form: QuickCreateInput): Promise<CreateIssueResultWithTimeout>
  handleMrMerged(input: { key: string; targetStatusName: string }): Promise<HandleMrMergedResult>
  refreshAll(): void
  notifyUnauthorizedOnce(service: 'gitlab'): void
}

export type DashboardServiceDeps = {
  cache: DashboardCache
  jira: {
    transitionIssue: TransitionIssueFn
    createIssue: CreateIssueFn
  }
  clock: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  createIssueTimeoutMs: number
  toast: { success: ToastFn; error: ToastFn }
  navigateToIssue: (key: string) => void
  openInBrowser: (url: string) => void
}

export function createDashboardService(deps: DashboardServiceDeps): DashboardService {
  const { cache, jira, toast } = deps
  const unauthorizedNotified = new Set<'gitlab'>()

  async function applyTransition(input: {
    key: string
    transitionId: string
    toStatusName: string
  }): Promise<TransitionIssueResult> {
    const { key, transitionId, toStatusName } = input

    await Promise.all([cache.cancelBoard(), cache.cancelIssue(key)])

    const rollbackBoard = cache.patchBoard((prev) => {
      if (prev === undefined || !prev.ok) return prev
      return {
        ...prev,
        issues: prev.issues.map((issue) =>
          issue.key === key ? { ...issue, statusName: toStatusName } : issue,
        ),
      } satisfies SearchIssuesResult
    })
    const rollbackIssue = cache.patchIssue(key, (prev) => {
      if (prev === undefined || !prev.ok) return prev
      return {
        ...prev,
        issue: { ...prev.issue, statusName: toStatusName },
      } satisfies GetIssueResult
    })

    let result: TransitionIssueResult
    try {
      result = await jira.transitionIssue({ data: { key, transitionId } })
    } catch (err) {
      rollbackBoard()
      rollbackIssue()
      const message = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Couldn't change status: ${message}`)
      throw err
    }

    if (!result.ok) {
      rollbackBoard()
      rollbackIssue()
      toast.error(result.message)
      return result
    }

    cache.invalidateIssue(key)
    cache.invalidateTransitions(key)
    return result
  }

  async function createIssueAction(form: QuickCreateInput): Promise<CreateIssueResultWithTimeout> {
    const controller = new AbortController()
    let timedOut = false
    const handle = deps.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, deps.createIssueTimeoutMs)
    try {
      const result = await jira.createIssue({ data: form, signal: controller.signal })
      if (!result.ok) {
        toast.error('Failed to create ticket', { description: result.message })
        return result
      }
      cache.invalidateBoard()
      const { key, baseUrl } = result
      toast.success(`Created ${key}`, {
        action: {
          label: 'Open',
          onClick: () => deps.navigateToIssue(key),
        },
        cancel: {
          label: 'View in Jira',
          onClick: () => deps.openInBrowser(`${baseUrl}/browse/${key}`),
        },
      })
      return result
    } catch (err) {
      if (timedOut) {
        toast.error('Request timed out — try again')
        return { ok: false, reason: 'timed-out', message: 'Request timed out' }
      }
      toast.error('Failed to create ticket')
      throw err
    } finally {
      deps.clearTimeout(handle)
    }
  }

  async function handleMrMerged(input: {
    key: string
    targetStatusName: string
  }): Promise<HandleMrMergedResult> {
    const { key, targetStatusName } = input
    const transitions = await cache.fetchTransitions(key)
    if (!transitions.ok) {
      const message =
        transitions.reason === 'unauthorized'
          ? 'Invalid Jira credentials'
          : "Couldn't load transitions"
      toast.error(message)
      return { ok: false, reason: 'transitions-failed', message }
    }
    const target = transitions.transitions.find(
      (t) => t.toStatusName.toLowerCase() === targetStatusName.toLowerCase(),
    )
    if (target === undefined) {
      toast.error(`No direct transition to ${targetStatusName}. Move ${key} in Jira.`)
      return { ok: false, reason: 'no-direct-transition' }
    }
    const result = await applyTransition({
      key,
      transitionId: target.id,
      toStatusName: targetStatusName,
    })
    if (!result.ok) {
      return { ok: false, reason: 'transition-rejected', message: result.message }
    }
    return { ok: true, transitionId: target.id }
  }

  function refreshAll() {
    cache.invalidateBoard()
    cache.invalidateAllIssues()
    cache.invalidateMrStatuses()
  }

  function notifyUnauthorizedOnce(service: 'gitlab') {
    if (unauthorizedNotified.has(service)) return
    unauthorizedNotified.add(service)
    toast.error('GitLab auth failed — check `GITLAB_TOKEN`')
  }

  return {
    applyTransition,
    createIssue: createIssueAction,
    handleMrMerged,
    refreshAll,
    notifyUnauthorizedOnce,
  }
}
