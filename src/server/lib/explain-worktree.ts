// The throwaway checkout one Explain run reads. A **detached** worktree at the
// merge request's head commit, under a root of its own:
//
//   ~/projects/worktrees/dr-web-explain/mr-<iid>
//
// Both properties are load-bearing (ADR-0009 §5):
//
//   - **Detached at the head SHA** is what makes a report reproducible. The tab
//     can name the commit it describes and say "3 new commits since this report"
//     instead of silently describing an older tree, and no branch exists that
//     could drift underneath it.
//   - **A separate root** is what makes "closing a tab discards the worktree"
//     safe. `dr-web-explain/` can never reach `dr-web/<KEY>`, where the user's
//     own work in progress lives — so a mis-aimed discard cannot cost work.
//
// Nothing is installed or built here (ADR-0009 §6): a fresh worktree has no
// `node_modules`, and installing would cost minutes of dead time and gigabytes
// per open tab. The report's `unverified` block is where that consequence is
// stated rather than hidden.

import {
  addDetachedWorktree,
  fetchRef,
  removeWorktree,
  repoPath,
  type ExistsFn,
  type RemoveWorktreeInBackground,
  type SpawnFn,
  type WorktreeError,
} from './git-worktree'

export type ExplainWorktreeDeps = {
  readonly homeDir: string
  readonly exists: ExistsFn
  readonly spawn: SpawnFn
}

export type PrepareExplainWorktreeResult =
  | { readonly ok: true; readonly worktreePath: string }
  | { readonly ok: false; readonly error: WorktreeError }

export type DiscardExplainWorktreeResult = { readonly removed: boolean }

/** Guards every path this module builds, so an iid can never become a filename. */
function assertIid(iid: number, label: string): number {
  if (!Number.isInteger(iid) || iid <= 0) {
    throw new Error(`${label} (iid): must be a positive integer`)
  }
  return iid
}

/** The Explain-only worktree root — deliberately *not* `dr-web/`. */
export function explainWorktreeRoot(homeDir: string): string {
  return `${homeDir}/projects/worktrees/dr-web-explain`
}

export function explainWorktreePath(iid: number, homeDir: string): string {
  return `${explainWorktreeRoot(homeDir)}/mr-${assertIid(iid, 'explainWorktreePath')}`
}

/**
 * GitLab publishes every merge request's head under a server-side ref, which is
 * the one handle that works regardless of the source branch's name, its fate, or
 * whether the MR came from a fork. Fetching it is also what puts the head commit
 * in the object store so `worktree add --detach <sha>` can find it — a bare
 * `git fetch origin <sha>` needs a server config we do not control.
 */
export function mergeRequestHeadRef(iid: number): string {
  return `refs/merge-requests/${assertIid(iid, 'mergeRequestHeadRef')}/head`
}

/**
 * Check the MR's head commit out into its own detached worktree.
 *
 * A worktree already at this path is **removed first** rather than reused: a
 * re-run exists precisely because the author pushed, so the tree has to move to
 * the new SHA, and a stale checkout is the one thing a reproducible report must
 * not read.
 *
 * The target branch is fetched alongside the head so the agent can compute the
 * change as `origin/<targetBranch>...<headSha>` inside the worktree. It is taken
 * from the MR rather than assumed to be `develop` — not every MR targets it.
 */
export function runPrepareExplainWorktree(
  input: { readonly iid: number; readonly headSha: string; readonly targetBranch: string },
  deps: ExplainWorktreeDeps,
): PrepareExplainWorktreeResult {
  const worktreePath = explainWorktreePath(input.iid, deps.homeDir)
  const repo = repoPath(deps.homeDir)

  if (deps.exists(worktreePath)) {
    const removeErr = removeWorktree(deps.spawn, repo, worktreePath)
    if (removeErr !== null) return { ok: false, error: removeErr }
  }

  const headErr = fetchRef(deps.spawn, repo, mergeRequestHeadRef(input.iid))
  if (headErr !== null) return { ok: false, error: headErr }

  const targetErr = fetchRef(deps.spawn, repo, input.targetBranch)
  if (targetErr !== null) return { ok: false, error: targetErr }

  const addErr = addDetachedWorktree(deps.spawn, repo, worktreePath, input.headSha)
  if (addErr !== null) return { ok: false, error: addErr }

  return { ok: true, worktreePath }
}

/**
 * Remove the worktree for one MR. Fire-and-forget, the pattern
 * `runDiscardWorkspace` already establishes: closing a tab must feel instant,
 * and a leftover directory is harmless because the next prepare removes it.
 *
 * A missing worktree is success, not an error — closing a tab whose run never
 * got past `preparing` has nothing to remove, and failing there would leave a
 * tab the user cannot close.
 */
export function runDiscardExplainWorktree(
  iid: number,
  deps: {
    readonly homeDir: string
    readonly exists: ExistsFn
    readonly removeWorktreeInBackground: RemoveWorktreeInBackground
  },
): DiscardExplainWorktreeResult {
  const worktreePath = explainWorktreePath(iid, deps.homeDir)
  if (!deps.exists(worktreePath)) return { removed: false }
  deps.removeWorktreeInBackground(repoPath(deps.homeDir), worktreePath)
  return { removed: true }
}
