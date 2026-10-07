import { spawn, spawnSync, type SpawnSyncReturns } from 'node:child_process'

// The two child-process adapters the worktree code depends on, in one place.
//
// `open-workspace.ts` and `explain-worktree.ts` declare both as *ports* so they
// stay unit-testable with a fake spawn; this module is the one real
// implementation behind those ports. It was written twice — once for the Detail
// surface's workspace actions and once for Explain's worktrees — which is two
// places for one decision about how git is invoked.

/** `spawnSync` with text output, which is what every call site wants back. */
export function utf8Spawn(command: string, args: ReadonlyArray<string>): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], { encoding: 'utf8' })
}

/**
 * Remove a worktree in a detached, unref'd child, so the (~30s) deletion
 * outlives the request and never blocks the caller. stdio is ignored because
 * this is best-effort cleanup: a leftover directory is harmless, since the next
 * prepare removes it.
 */
export function removeWorktreeInBackground(repoPath: string, worktreePath: string): void {
  spawn('git', ['-C', repoPath, 'worktree', 'remove', '--force', worktreePath], {
    detached: true,
    stdio: 'ignore',
  }).unref()
}
