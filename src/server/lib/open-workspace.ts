import type { SpawnSyncReturns } from 'node:child_process'

export type SpawnFn = (command: string, args: ReadonlyArray<string>) => SpawnSyncReturns<string>

export type ExistsFn = (path: string) => boolean

export type WorkspaceError = { readonly message: string }

export type OpenInWorkspaceOk = { readonly ok: true }
export type OpenInWorkspaceErr = { readonly ok: false; readonly error: WorkspaceError }
export type OpenInWorkspaceResult = OpenInWorkspaceOk | OpenInWorkspaceErr

export type CheckWorktreeResult = { readonly worktreeExists: boolean }

export function worktreePathFor(issueKey: string, homeDir: string): string {
  return `${homeDir}/projects/worktrees/dr-web/${issueKey}`
}

export function repoPath(homeDir: string): string {
  return `${homeDir}/projects/dr-web`
}

export function workspaceNameFor(issueKey: string): string {
  return `GeoCloud ${issueKey}`
}

export function runCheckWorktree(
  issueKey: string,
  deps: { homeDir: string; exists: ExistsFn },
): CheckWorktreeResult {
  return { worktreeExists: deps.exists(worktreePathFor(issueKey, deps.homeDir)) }
}

export function buildLayoutJson(): string {
  return JSON.stringify({
    direction: 'vertical',
    split: 0.7,
    children: [
      {
        direction: 'horizontal',
        split: 0.5,
        children: [
          {
            pane: {
              surfaces: [{ type: 'terminal', command: 'claude --dangerously-skip-permissions' }],
            },
          },
          {
            pane: {
              surfaces: [
                { type: 'terminal', command: 'nvim .' },
                { type: 'terminal', command: 'lazygit' },
                { type: 'terminal', command: 'lumen diff' },
              ],
            },
          },
        ],
      },
      {
        pane: {
          surfaces: [{ type: 'terminal', command: 'pnpm i && nx run-many -t i18n-compile' }],
        },
      },
    ],
  })
}

// `cmux list-workspaces` prints lines like:
//   `  workspace:3  GeoCloud HDR-123`
//   `* workspace:2  Clashboard  [selected]`
// We tolerate the optional `*` indicator and the trailing `[...]` annotations.
const WORKSPACE_LINE = /^\s*\*?\s*(workspace:\d+)\s+(.+?)(?:\s+\[[^\]]+\])*\s*$/u

export function findWorkspaceRefByName(listOutput: string, name: string): string | null {
  for (const line of listOutput.split('\n')) {
    const match = WORKSPACE_LINE.exec(line)
    if (match === null) continue
    if (match[2] === name) return match[1] ?? null
  }
  return null
}

function describeFailure(result: SpawnSyncReturns<string>, fallback: string): WorkspaceError {
  if (result.error !== undefined) return { message: result.error.message }
  const stderr = result.stderr?.toString().trim()
  if (stderr !== undefined && stderr.length > 0) return { message: stderr }
  return { message: `${fallback} exited with code ${result.status ?? 'unknown'}` }
}

function runStep(
  spawn: SpawnFn,
  command: string,
  args: ReadonlyArray<string>,
  label: string,
): WorkspaceError | null {
  const result = spawn(command, args)
  if (result.error !== undefined || result.status !== 0) return describeFailure(result, label)
  return null
}

type WorktreeDeps = { homeDir: string; exists: ExistsFn; spawn: SpawnFn }

function ensureWorktree(
  issueKey: string,
  branchName: string | undefined,
  deps: WorktreeDeps,
): WorkspaceError | null {
  const worktreePath = worktreePathFor(issueKey, deps.homeDir)
  if (deps.exists(worktreePath)) return null
  if (branchName === undefined || branchName.trim() === '') {
    return { message: 'branchName is required when worktree does not exist' }
  }
  const repo = repoPath(deps.homeDir)
  const fetchErr = runStep(
    deps.spawn,
    'git',
    ['-C', repo, 'fetch', 'origin', 'develop'],
    'git fetch',
  )
  if (fetchErr !== null) return fetchErr
  const addErr = runStep(
    deps.spawn,
    'git',
    ['-C', repo, 'worktree', 'add', worktreePath, '-b', branchName, 'origin/develop'],
    'git worktree add',
  )
  if (addErr !== null) return addErr
  // Configure upstream so `git push` (no flags) creates and pushes to
  // origin/<branchName> on first push. Equivalent to `git push --set-upstream`
  // without the upfront network call.
  const remoteErr = runStep(
    deps.spawn,
    'git',
    ['-C', repo, 'config', `branch.${branchName}.remote`, 'origin'],
    'git config branch.remote',
  )
  if (remoteErr !== null) return remoteErr
  return runStep(
    deps.spawn,
    'git',
    ['-C', repo, 'config', `branch.${branchName}.merge`, `refs/heads/${branchName}`],
    'git config branch.merge',
  )
}

function selectOrCreateWorkspace(
  workspaceName: string,
  worktreePath: string,
  spawn: SpawnFn,
): WorkspaceError | null {
  const listResult = spawn('cmux', ['list-workspaces'])
  if (listResult.error !== undefined || listResult.status !== 0) {
    return describeFailure(listResult, 'cmux list-workspaces')
  }
  const existingRef = findWorkspaceRefByName(listResult.stdout.toString(), workspaceName)
  if (existingRef !== null) {
    return runStep(
      spawn,
      'cmux',
      ['select-workspace', '--workspace', existingRef],
      'cmux select-workspace',
    )
  }
  return runStep(
    spawn,
    'cmux',
    [
      'new-workspace',
      '--name',
      workspaceName,
      '--cwd',
      worktreePath,
      '--layout',
      buildLayoutJson(),
      '--focus',
      'true',
    ],
    'cmux new-workspace',
  )
}

export function runOpenInWorkspace(
  issueKey: string,
  branchName: string | undefined,
  deps: WorktreeDeps,
): OpenInWorkspaceResult {
  const worktreeErr = ensureWorktree(issueKey, branchName, deps)
  if (worktreeErr !== null) return { ok: false, error: worktreeErr }
  const workspaceErr = selectOrCreateWorkspace(
    workspaceNameFor(issueKey),
    worktreePathFor(issueKey, deps.homeDir),
    deps.spawn,
  )
  if (workspaceErr !== null) return { ok: false, error: workspaceErr }
  return { ok: true }
}
