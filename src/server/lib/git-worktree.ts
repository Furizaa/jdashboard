// The git half of clashboard's worktree features, shared by the two things that
// cut a checkout out of `~/projects/dr-web`:
//
//   - `open-workspace.ts` — a **branch** worktree per ticket, paired with a cmux
//     workspace, where the user does their own work.
//   - `explain-worktree.ts` — a **detached** worktree per merge request, thrown
//     away when the Explain tab closes.
//
// This module was extracted from `open-workspace.ts` rather than copied: before
// Explain, `ensureWorktree` was only ever reached through `runOpenInWorkspace`
// and so was always paired with `selectOrCreateWorkspace` (ADR-0009 §5). The
// primitives below are what the two features genuinely share — the injected
// `spawn`/`exists` shape, the repo path, failure description, and the three git
// invocations. The *sequencing* stays with each caller, because a branch
// worktree and a detached one are not the same recipe.
//
// Everything is dependency-injected and synchronous (`spawnSync`-shaped), so
// both callers are unit-testable with a recorder and never spawn a process.

import type { SpawnSyncReturns } from 'node:child_process'

export type SpawnFn = (command: string, args: ReadonlyArray<string>) => SpawnSyncReturns<string>

export type ExistsFn = (path: string) => boolean

/** Every git failure reduces to one message the caller surfaces verbatim. */
export type WorktreeError = { readonly message: string }

/** Detached, fire-and-forget removal of a worktree directory. */
export type RemoveWorktreeInBackground = (repoPath: string, worktreePath: string) => void

/** The single checkout every worktree in the app is cut from. */
export function repoPath(homeDir: string): string {
  return `${homeDir}/projects/dr-web`
}

/**
 * A spawn result turned into one message: the spawn error if the process never
 * ran, then stderr, then a synthesised line naming the step and the exit code.
 */
export function describeFailure(result: SpawnSyncReturns<string>, fallback: string): WorktreeError {
  if (result.error !== undefined) return { message: result.error.message }
  const stderr = result.stderr?.toString().trim()
  if (stderr !== undefined && stderr.length > 0) return { message: stderr }
  return { message: `${fallback} exited with code ${result.status ?? 'unknown'}` }
}

/** Run one command; `null` is success, so callers read as a flat early-return chain. */
export function runStep(
  spawn: SpawnFn,
  command: string,
  args: ReadonlyArray<string>,
  label: string,
): WorktreeError | null {
  const result = spawn(command, args)
  if (result.error !== undefined || result.status !== 0) return describeFailure(result, label)
  return null
}

/** `git fetch origin <ref>` in the shared repo. `ref` may be a branch or a full refspec. */
export function fetchRef(spawn: SpawnFn, repo: string, ref: string): WorktreeError | null {
  return runStep(spawn, 'git', ['-C', repo, 'fetch', 'origin', ref], 'git fetch')
}

/** `git worktree add <path> -b <branch> <startPoint>` — the workspace flavour. */
export function addBranchWorktree(
  spawn: SpawnFn,
  repo: string,
  worktreePath: string,
  branchName: string,
  startPoint: string,
): WorktreeError | null {
  return runStep(
    spawn,
    'git',
    ['-C', repo, 'worktree', 'add', worktreePath, '-b', branchName, startPoint],
    'git worktree add',
  )
}

/**
 * `git worktree add --detach <path> <commitish>` — the Explain flavour. Detached
 * is what makes a report reproducible: it names the commit it describes and
 * creates no branch that could drift (ADR-0009 §5).
 */
export function addDetachedWorktree(
  spawn: SpawnFn,
  repo: string,
  worktreePath: string,
  commitish: string,
): WorktreeError | null {
  return runStep(
    spawn,
    'git',
    ['-C', repo, 'worktree', 'add', '--detach', worktreePath, commitish],
    'git worktree add',
  )
}

/**
 * `git worktree remove --force <path>`, awaited. `--force` discards anything
 * uncommitted in the worktree — safe for a detached Explain checkout, which the
 * user never edits. The slow-but-harmless case (a workspace worktree full of
 * `node_modules`) uses the detached background removal instead.
 */
export function removeWorktree(
  spawn: SpawnFn,
  repo: string,
  worktreePath: string,
): WorktreeError | null {
  return runStep(
    spawn,
    'git',
    ['-C', repo, 'worktree', 'remove', '--force', worktreePath],
    'git worktree remove',
  )
}
