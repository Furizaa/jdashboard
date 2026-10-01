import { existsSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import { Effect, type Schema } from 'effect'
import type { AllowedTransition, DetailIssue } from '../gateways/jira/types'
import { DetailConfigLive } from '../contexts/detail/config'
import {
  LoadIssueError,
  LoadTransitionsError,
  PerformTransitionError,
} from '../contexts/detail/errors'
import { loadIssue } from '../contexts/detail/application/load-issue'
import { loadTransitions } from '../contexts/detail/application/load-transitions'
import { performTransition } from '../contexts/detail/application/perform-transition'
import { assertIssueKey } from '../lib/jql'
import { GitlabGateway } from '../gateways/gitlab/port'
import { appRuntime } from '../runtime/app-runtime'
import {
  runCheckWorktree,
  runDiscardWorkspace,
  runFocusWorkspace,
  runListWorkspaces,
  runOpenInWorkspace,
} from '../lib/open-workspace'
import type {
  CheckWorktreeResult,
  ListWorkspacesResult,
  OpenInWorkspaceResult,
} from '../lib/open-workspace'
import { runWire } from './run-wire'
import type { WireResult } from '../wire/to-wire'

type LoadIssueErrorWire = Schema.Schema.Encoded<typeof LoadIssueError>
type LoadTransitionsErrorWire = Schema.Schema.Encoded<typeof LoadTransitionsError>
type PerformTransitionErrorWire = Schema.Schema.Encoded<typeof PerformTransitionError>

export type GetIssueResult = WireResult<
  { readonly baseUrl: string; readonly issue: DetailIssue },
  LoadIssueErrorWire
>

export type GetTransitionsResult = WireResult<
  { readonly transitions: readonly AllowedTransition[] },
  LoadTransitionsErrorWire
>

export type TransitionIssueResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: PerformTransitionErrorWire }

export type MrSourceBranchResult = { readonly sourceBranch: string | null }

function requireIssueKey(label: string, value: unknown): string {
  return assertIssueKey(typeof value === 'string' ? value : '', label)
}

function requireIid(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error('getMrSourceBranch (iid): must be a positive integer')
  }
  return value
}

function requireTransitionId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('transitionIssue (transitionId): required')
  }
  return value.trim()
}

// cmux color: a named color or a #RRGGBB hex. Anything else is dropped rather
// than rejected — the workspace still opens, just without the requested color.
function optionalColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^(#[0-9A-Fa-f]{6}|[A-Za-z]+)$/.test(trimmed) ? trimmed : undefined
}

function utf8Spawn(command: string, args: ReadonlyArray<string>) {
  return spawnSync(command, [...args], { encoding: 'utf8' })
}

// Detached, unref'd child so the ~30s worktree deletion outlives the request
// and never blocks the caller. stdio ignored — it's best-effort cleanup.
function removeWorktreeInBackground(repoPath: string, worktreePath: string): void {
  spawn('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktreePath], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}

export const getIssue = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({ key: requireIssueKey('getIssue', data?.key) }))
  .handler(async ({ data }): Promise<GetIssueResult> => {
    const program = loadIssue(data.key).pipe(Effect.provide(DetailConfigLive))
    return runWire(program, LoadIssueError, 'getIssue')
  })

export const getTransitions = createServerFn({ method: 'GET' })
  .inputValidator((data: { key: string }) => ({
    key: requireIssueKey('getTransitions', data?.key),
  }))
  .handler(
    async ({ data }): Promise<GetTransitionsResult> =>
      runWire(loadTransitions(data.key), LoadTransitionsError, 'getTransitions'),
  )

export const transitionIssue = createServerFn({ method: 'POST' })
  .inputValidator((data: { key: string; transitionId: string }) => ({
    key: requireIssueKey('transitionIssue', data?.key),
    transitionId: requireTransitionId(data?.transitionId),
  }))
  .handler(
    async ({ data }): Promise<TransitionIssueResult> =>
      runWire(
        performTransition(data.key, data.transitionId),
        PerformTransitionError,
        'transitionIssue',
      ),
  )

// Resolve the MR's branch straight from GitLab by iid — the only reliable
// source, since branch names don't always embed the issue key. A failed lookup
// degrades to null so the caller falls back to creating a fresh branch.
const mrSourceBranchProgram = (iid: number) =>
  Effect.gen(function* () {
    const gitlab = yield* GitlabGateway
    const detail = yield* gitlab.getMr(iid)
    return detail.sourceBranch
  }).pipe(Effect.catchAll(() => Effect.succeed<string | null>(null)))

export const getMrSourceBranch = createServerFn({ method: 'POST' })
  .inputValidator((data: { iid: number }) => ({ iid: requireIid(data?.iid) }))
  .handler(
    async ({ data }): Promise<MrSourceBranchResult> => ({
      sourceBranch: await appRuntime.runPromise(mrSourceBranchProgram(data.iid)),
    }),
  )

export const checkWorktree = createServerFn({ method: 'POST' })
  .inputValidator((data: { issueKey: string }) => ({
    issueKey: requireIssueKey('checkWorktree', data?.issueKey),
  }))
  .handler(
    async ({ data }): Promise<CheckWorktreeResult> =>
      runCheckWorktree(data.issueKey, { homeDir: homedir(), exists: existsSync }),
  )

export const openInWorkspace = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      issueKey: string
      branchName?: string
      fromExistingBranch?: boolean
      workspaceName?: string
      color?: string
    }) => ({
      issueKey: requireIssueKey('openInWorkspace', data?.issueKey),
      branchName:
        typeof data?.branchName === 'string' && data.branchName.trim() !== ''
          ? data.branchName.trim()
          : undefined,
      fromExistingBranch: data?.fromExistingBranch === true,
      workspaceName:
        typeof data?.workspaceName === 'string' && data.workspaceName.trim() !== ''
          ? data.workspaceName.trim()
          : undefined,
      color: optionalColor(data?.color),
    }),
  )
  .handler(
    async ({ data }): Promise<OpenInWorkspaceResult> =>
      runOpenInWorkspace(
        data.issueKey,
        data.branchName,
        { homeDir: homedir(), exists: existsSync, spawn: utf8Spawn },
        {
          fromExistingBranch: data.fromExistingBranch,
          workspaceName: data.workspaceName,
          color: data.color,
        },
      ),
  )

export const listWorkspaces = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ListWorkspacesResult> => runListWorkspaces({ spawn: utf8Spawn }),
)

export const focusWorkspace = createServerFn({ method: 'POST' })
  .inputValidator((data: { issueKey: string }) => ({
    issueKey: requireIssueKey('focusWorkspace', data?.issueKey),
  }))
  .handler(
    async ({ data }): Promise<OpenInWorkspaceResult> =>
      runFocusWorkspace(data.issueKey, { spawn: utf8Spawn }),
  )

export const discardWorkspace = createServerFn({ method: 'POST' })
  .inputValidator((data: { issueKey: string }) => ({
    issueKey: requireIssueKey('discardWorkspace', data?.issueKey),
  }))
  .handler(
    async ({ data }): Promise<OpenInWorkspaceResult> =>
      runDiscardWorkspace(data.issueKey, {
        homeDir: homedir(),
        exists: existsSync,
        spawn: utf8Spawn,
        removeWorktreeInBackground,
      }),
  )
