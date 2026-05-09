import { err, ok, Result, ResultAsync } from 'neverthrow'
import { match } from 'ts-pattern'
import type { CreateIssueResult } from '~/server/jira'
import type { SearchIssuesResult } from '~/server/server-functions/board'
import type { GetIssueResult, TransitionIssueResult } from '~/server/server-functions/detail'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'
import {
  CreateIssueNetworkError,
  CreateIssueRejected,
  CreateIssueTimeout,
  CreateIssueUnauthorized,
  MrMergedNoDirectTransition,
  MrMergedTransitionRejected,
  MrMergedTransitionsFailed,
  TransitionNetworkError,
  TransitionRejected,
  TransitionUnauthorized,
  type ApplyTransitionError,
  type CreateIssueError,
  type HandleMrMergedError,
} from './errors'
import type { Browser, Cache, Navigate, Toast } from './ports'

export type TransitionIssueFn = (args: {
  data: { key: string; transitionId: string }
}) => Promise<TransitionIssueResult>

export type CreateIssueFn = (args: {
  data: QuickCreateInput
  signal?: AbortSignal
}) => Promise<CreateIssueResult>

export type ApplyTransitionInput = {
  key: string
  transitionId: string
  toStatusName: string
}

export type CreateIssueSnapshot = { key: string; baseUrl: string }

export type MrMergedSnapshot = { transitionId: string }

export type Coordinator = {
  applyTransition(input: ApplyTransitionInput): ResultAsync<void, ApplyTransitionError>
  createIssue(form: QuickCreateInput): ResultAsync<CreateIssueSnapshot, CreateIssueError>
  handleMrMerged(input: {
    key: string
    targetStatusName: string
  }): ResultAsync<MrMergedSnapshot, HandleMrMergedError>
  refreshAll(): void
  notifyUnauthorizedOnce(service: 'gitlab'): void
}

export type CoordinatorDeps = {
  cache: Cache
  toast: Toast
  navigate: Navigate
  browser: Browser
  jira: {
    transitionIssue: TransitionIssueFn
    createIssue: CreateIssueFn
  }
  clock: () => number
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
  createIssueTimeoutMs: number
}

export function createCoordinator(deps: CoordinatorDeps): Coordinator {
  const { cache, jira, toast, navigate, browser } = deps
  const unauthorizedNotified = new Set<'gitlab'>()

  async function runApplyTransition(
    input: ApplyTransitionInput,
  ): Promise<Result<void, ApplyTransitionError>> {
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
    } catch (e) {
      rollbackBoard()
      rollbackIssue()
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast.error(`Couldn't change status: ${message}`)
      return err(new TransitionNetworkError(message))
    }

    return match(result)
      .with({ ok: true }, (): Result<void, ApplyTransitionError> => {
        cache.invalidateIssue(key)
        cache.invalidateTransitions(key)
        // oxlint-disable-next-line no-useless-undefined -- neverthrow's ok<void>() requires explicit undefined
        return ok(undefined)
      })
      .with({ ok: false, error: { _tag: 'Rejected' } }, ({ error }) => {
        rollbackBoard()
        rollbackIssue()
        toast.error(error.message)
        return err<void, ApplyTransitionError>(new TransitionRejected(error.message))
      })
      .with({ ok: false, error: { _tag: 'Unauthorized' } }, () => {
        const message = 'Invalid Jira credentials'
        rollbackBoard()
        rollbackIssue()
        toast.error(message)
        return err<void, ApplyTransitionError>(new TransitionUnauthorized(message))
      })
      .exhaustive()
  }

  function applyTransition(input: ApplyTransitionInput): ResultAsync<void, ApplyTransitionError> {
    return new ResultAsync(runApplyTransition(input))
  }

  async function runCreateIssue(
    form: QuickCreateInput,
  ): Promise<Result<CreateIssueSnapshot, CreateIssueError>> {
    const controller = new AbortController()
    let timedOut = false
    const handle = deps.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, deps.createIssueTimeoutMs)
    try {
      let result: CreateIssueResult
      try {
        result = await jira.createIssue({ data: form, signal: controller.signal })
      } catch (e) {
        if (timedOut) {
          toast.error('Request timed out — try again')
          return err(new CreateIssueTimeout())
        }
        toast.error('Failed to create ticket')
        const message = e instanceof Error ? e.message : 'Unknown error'
        return err(new CreateIssueNetworkError(message))
      }

      return match(result)
        .with({ ok: true }, ({ key, baseUrl }): Result<CreateIssueSnapshot, CreateIssueError> => {
          cache.invalidateBoard()
          toast.success(`Created ${key}`, {
            action: {
              label: 'Open',
              onClick: () => navigate.toIssue(key),
            },
            cancel: {
              label: 'View in Jira',
              onClick: () => browser.openInNewTab(`${baseUrl}/browse/${key}`),
            },
          })
          return ok({ key, baseUrl })
        })
        .with({ ok: false, reason: 'rejected' }, ({ message }) => {
          toast.error('Failed to create ticket', { description: message })
          return err<CreateIssueSnapshot, CreateIssueError>(new CreateIssueRejected(message))
        })
        .with({ ok: false, reason: 'unauthorized' }, ({ message }) => {
          toast.error('Failed to create ticket', { description: message })
          return err<CreateIssueSnapshot, CreateIssueError>(new CreateIssueUnauthorized(message))
        })
        .exhaustive()
    } finally {
      deps.clearTimeout(handle)
    }
  }

  function createIssue(form: QuickCreateInput): ResultAsync<CreateIssueSnapshot, CreateIssueError> {
    return new ResultAsync(runCreateIssue(form))
  }

  async function runHandleMrMerged(input: {
    key: string
    targetStatusName: string
  }): Promise<Result<MrMergedSnapshot, HandleMrMergedError>> {
    const { key, targetStatusName } = input
    const transitions = await cache.fetchTransitions(key)

    return match(transitions)
      .with(
        { ok: false, error: { _tag: 'Unauthorized' } },
        async (): Promise<Result<MrMergedSnapshot, HandleMrMergedError>> => {
          const message = 'Invalid Jira credentials'
          toast.error(message)
          return err(new MrMergedTransitionsFailed(message))
        },
      )
      .with({ ok: false, error: { _tag: 'NotFound' } }, async () => {
        const message = "Couldn't load transitions"
        toast.error(message)
        return err<MrMergedSnapshot, HandleMrMergedError>(new MrMergedTransitionsFailed(message))
      })
      .with({ ok: true }, async ({ transitions: list }) => {
        const target = list.find(
          (t) => t.toStatusName.toLowerCase() === targetStatusName.toLowerCase(),
        )
        if (target === undefined) {
          toast.error(`No direct transition to ${targetStatusName}. Move ${key} in Jira.`)
          return err<MrMergedSnapshot, HandleMrMergedError>(
            new MrMergedNoDirectTransition(key, targetStatusName),
          )
        }
        const transitionResult = await runApplyTransition({
          key,
          transitionId: target.id,
          toStatusName: targetStatusName,
        })
        return transitionResult.match<Result<MrMergedSnapshot, HandleMrMergedError>>(
          () => ok({ transitionId: target.id }),
          (cause) => err(new MrMergedTransitionRejected(cause)),
        )
      })
      .exhaustive()
  }

  function handleMrMerged(input: {
    key: string
    targetStatusName: string
  }): ResultAsync<MrMergedSnapshot, HandleMrMergedError> {
    return new ResultAsync(runHandleMrMerged(input))
  }

  function refreshAll() {
    cache.invalidateBoard()
    cache.invalidateAllIssues()
    cache.invalidateMrStatuses()
    cache.invalidateReviewCards()
  }

  function notifyUnauthorizedOnce(service: 'gitlab') {
    if (unauthorizedNotified.has(service)) return
    unauthorizedNotified.add(service)
    toast.error('GitLab auth failed — check `GITLAB_TOKEN`')
  }

  return {
    applyTransition,
    createIssue,
    handleMrMerged,
    refreshAll,
    notifyUnauthorizedOnce,
  }
}
