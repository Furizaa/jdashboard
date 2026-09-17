import type { SpawnSyncReturns } from 'node:child_process'

export type SpawnFn = (command: string, args: ReadonlyArray<string>) => SpawnSyncReturns<string>

export type ExistsFn = (path: string) => boolean

export type WorkspaceError = { readonly message: string }

export type OpenInWorkspaceOk = { readonly ok: true }
export type OpenInWorkspaceErr = { readonly ok: false; readonly error: WorkspaceError }
export type OpenInWorkspaceResult = OpenInWorkspaceOk | OpenInWorkspaceErr

export type CheckWorktreeResult = { readonly worktreeExists: boolean }

export type ListWorkspacesResult = { readonly openIssueKeys: readonly string[] }

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

// Issue keys embedded in a workspace name (e.g. `GeoCloud Invite HDR-20142`).
// Same shape as `assertIssueKey`'s pattern, but scanned mid-string: bounded by
// a non-alphanumeric on the left and no trailing letter/digit on the right so
// `HDR-1` never matches inside `HDR-19`.
const ISSUE_KEY_IN_NAME = /(?<![A-Za-z0-9])[A-Z][A-Z0-9]+-[1-9]\d*(?![0-9A-Za-z])/gu

export function issueKeysInName(name: string): readonly string[] {
  return name.match(ISSUE_KEY_IN_NAME) ?? []
}

export function listOpenIssueKeys(listOutput: string): string[] {
  const keys = new Set<string>()
  for (const line of listOutput.split('\n')) {
    const match = WORKSPACE_LINE.exec(line)
    if (match?.[2] === undefined) continue
    for (const key of issueKeysInName(match[2])) keys.add(key)
  }
  return [...keys]
}

export function findWorkspaceRefByIssueKey(listOutput: string, issueKey: string): string | null {
  for (const line of listOutput.split('\n')) {
    const match = WORKSPACE_LINE.exec(line)
    if (match === null || match[2] === undefined) continue
    if (issueKeysInName(match[2]).includes(issueKey)) return match[1] ?? null
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
  fromExistingBranch: boolean,
  deps: WorktreeDeps,
): WorkspaceError | null {
  const worktreePath = worktreePathFor(issueKey, deps.homeDir)
  if (deps.exists(worktreePath)) return null
  if (branchName === undefined || branchName.trim() === '') {
    return { message: 'branchName is required when worktree does not exist' }
  }
  const repo = repoPath(deps.homeDir)
  // For an issue that already has an MR, base the worktree on that MR's
  // existing remote branch; otherwise branch fresh off origin/develop.
  const startPoint = fromExistingBranch ? `origin/${branchName}` : 'origin/develop'
  const fetchRef = fromExistingBranch ? branchName : 'develop'
  const fetchErr = runStep(
    deps.spawn,
    'git',
    ['-C', repo, 'fetch', 'origin', fetchRef],
    'git fetch',
  )
  if (fetchErr !== null) return fetchErr
  const addErr = runStep(
    deps.spawn,
    'git',
    ['-C', repo, 'worktree', 'add', worktreePath, '-b', branchName, startPoint],
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

// A freshly-created workspace's color is set as a follow-up context-menu
// action (cmux `new-workspace` has no --color). Best-effort: the workspace
// already exists and is usable, so a color-set failure must not fail the open.
function applyColorBestEffort(workspaceName: string, color: string, spawn: SpawnFn): void {
  const listResult = spawn('cmux', ['list-workspaces'])
  if (listResult.error !== undefined || listResult.status !== 0) return
  const ref = findWorkspaceRefByName(listResult.stdout.toString(), workspaceName)
  if (ref === null) return
  spawn('cmux', ['workspace-action', '--action', 'set-color', '--color', color, '--workspace', ref])
}

function selectOrCreateWorkspace(
  workspaceName: string,
  worktreePath: string,
  color: string | undefined,
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
  const createErr = runStep(
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
  if (createErr !== null) return createErr
  if (color !== undefined && color !== '') applyColorBestEffort(workspaceName, color, spawn)
  return null
}

export function runOpenInWorkspace(
  issueKey: string,
  branchName: string | undefined,
  deps: WorktreeDeps,
  options: { fromExistingBranch?: boolean; workspaceName?: string; color?: string } = {},
): OpenInWorkspaceResult {
  const worktreeErr = ensureWorktree(
    issueKey,
    branchName,
    options.fromExistingBranch ?? false,
    deps,
  )
  if (worktreeErr !== null) return { ok: false, error: worktreeErr }
  const workspaceErr = selectOrCreateWorkspace(
    options.workspaceName ?? workspaceNameFor(issueKey),
    worktreePathFor(issueKey, deps.homeDir),
    options.color,
    deps.spawn,
  )
  if (workspaceErr !== null) return { ok: false, error: workspaceErr }
  return { ok: true }
}

export function runListWorkspaces(deps: { spawn: SpawnFn }): ListWorkspacesResult {
  const result = deps.spawn('cmux', ['list-workspaces'])
  if (result.error !== undefined || result.status !== 0) return { openIssueKeys: [] }
  return { openIssueKeys: listOpenIssueKeys(result.stdout.toString()) }
}

export function runFocusWorkspace(
  issueKey: string,
  deps: { spawn: SpawnFn },
): OpenInWorkspaceResult {
  const listResult = deps.spawn('cmux', ['list-workspaces'])
  if (listResult.error !== undefined || listResult.status !== 0) {
    return { ok: false, error: describeFailure(listResult, 'cmux list-workspaces') }
  }
  const ref = findWorkspaceRefByIssueKey(listResult.stdout.toString(), issueKey)
  if (ref === null) {
    return { ok: false, error: { message: `No open workspace found for ${issueKey}` } }
  }
  const err = runStep(
    deps.spawn,
    'cmux',
    ['select-workspace', '--workspace', ref],
    'cmux select-workspace',
  )
  return err !== null ? { ok: false, error: err } : { ok: true }
}

export type DiscardDeps = WorktreeDeps & {
  // Detached, fire-and-forget removal of the worktree directory (see below).
  removeWorktreeInBackground: (repoPath: string, worktreePath: string) => void
}

// Tear down both halves of an open workspace: the cmux workspace and the git
// worktree. `--force` discards uncommitted changes in the worktree; the local
// branch is deliberately left intact so committed work survives a discard.
//
// Discard splits into a fast part and a slow part: closing the cmux workspace
// is instant and is what clears the ticket's "workspace open" state, whereas
// removing the worktree is a ~30s `rm -rf` of node_modules et al. So we await
// the close (and surface its errors) but fire the worktree removal detached —
// concurrent `git worktree remove` against the same repo is safe, so the user
// can keep working and even discard other tickets while deletions overlap.
// A background removal failure is not surfaced: a leftover worktree is
// harmless (the next open reuses it).
export function runDiscardWorkspace(issueKey: string, deps: DiscardDeps): OpenInWorkspaceResult {
  const listResult = deps.spawn('cmux', ['list-workspaces'])
  if (listResult.error !== undefined || listResult.status !== 0) {
    return { ok: false, error: describeFailure(listResult, 'cmux list-workspaces') }
  }
  const ref = findWorkspaceRefByIssueKey(listResult.stdout.toString(), issueKey)
  const worktreePath = worktreePathFor(issueKey, deps.homeDir)
  const worktreePresent = deps.exists(worktreePath)
  if (ref === null && !worktreePresent) {
    return { ok: false, error: { message: `No open workspace or worktree for ${issueKey}` } }
  }
  if (ref !== null) {
    const closeErr = runStep(
      deps.spawn,
      'cmux',
      ['close-workspace', '--workspace', ref],
      'cmux close-workspace',
    )
    if (closeErr !== null) return { ok: false, error: closeErr }
  }
  if (worktreePresent) {
    deps.removeWorktreeInBackground(repoPath(deps.homeDir), worktreePath)
  }
  return { ok: true }
}
