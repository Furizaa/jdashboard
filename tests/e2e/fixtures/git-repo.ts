import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// A real, tiny `dr-web` checkout under the suite's throwaway HOME.
//
// Explain's prepare step is genuine git — `git fetch origin
// refs/merge-requests/<iid>/head` then `git worktree add --detach <path> <sha>`
// — and stubbing git would mean the e2e stopped testing the thing most likely
// to be wrong. ADR-0001's "mock at the network boundary" does not apply here:
// git is neither the network nor the agent, it is the local filesystem, and the
// local filesystem is already isolated (HOME points at a temp directory).
//
// So this builds the two repositories the real layout has:
//
//   $HOME/origin.git            a bare "origin", carrying develop and the
//                               server-side merge-request head ref
//   $HOME/projects/dr-web       the clone every worktree is cut from
//
// and returns the head SHA, which the spec seeds as the MR's `sha` so the app
// asks for a commit that actually exists.

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'E2E',
  GIT_AUTHOR_EMAIL: 'e2e@test.local',
  GIT_COMMITTER_NAME: 'E2E',
  GIT_COMMITTER_EMAIL: 'e2e@test.local',
  // Keep a developer's own git config (hooks, signing, templates) out of it.
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
}

function git(cwd: string, ...args: string[]): string {
  // stderr piped, not inherited: git's progress chatter would otherwise bury
  // the test reporter's output.
  return execFileSync('git', args, {
    cwd,
    env: GIT_ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function homeDir(): string {
  const home = process.env.CLASHBOARD_E2E_HOME
  if (home === undefined || home === '') {
    throw new Error('CLASHBOARD_E2E_HOME is unset — playwright.config.ts should have set it')
  }
  return home
}

export type SeededRepo = {
  /** The commit on the MR's source branch — seed this as the MR's `sha`. */
  readonly headSha: string
  readonly worktreePath: (iid: number) => string
}

/**
 * Build `origin.git` + `projects/dr-web`, with `develop` and one feature commit
 * published at `refs/merge-requests/<iid>/head`.
 */
export function seedDrWebRepo(iid: number): SeededRepo {
  const home = homeDir()
  const origin = join(home, 'origin.git')
  const repo = join(home, 'projects', 'dr-web')
  const seed = join(home, 'seed')

  for (const path of [origin, repo, seed]) rmSync(path, { recursive: true, force: true })
  mkdirSync(join(home, 'projects'), { recursive: true })
  mkdirSync(seed, { recursive: true })

  git(home, 'init', '--bare', '--initial-branch=develop', origin)

  // A working clone to author the two commits in.
  git(seed, 'init', '--initial-branch=develop', '.')
  writeFileSync(join(seed, 'README.md'), '# dr-web\n', 'utf8')
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'initial')
  git(seed, 'remote', 'add', 'origin', origin)
  git(seed, 'push', 'origin', 'develop')

  git(seed, 'checkout', '-b', 'feat/rounding')
  writeFileSync(join(seed, 'quote.ts'), 'export const quote = () => 1\n', 'utf8')
  git(seed, 'add', '.')
  git(seed, 'commit', '-m', 'move rounding out of pricing')
  const headSha = git(seed, 'rev-parse', 'HEAD')
  // GitLab publishes every MR's head under this server-side ref; a full refspec
  // is what lets a plain repository carry one.
  git(seed, 'push', 'origin', `HEAD:refs/merge-requests/${iid}/head`)

  git(home, 'clone', origin, repo)

  return {
    headSha,
    worktreePath: (forIid) => join(home, 'projects', 'worktrees', 'dr-web-explain', `mr-${forIid}`),
  }
}

/** Wipe everything this fixture made, including any worktree a run left behind. */
export function resetDrWebRepo(): void {
  const home = homeDir()
  for (const path of [join(home, 'origin.git'), join(home, 'seed'), join(home, 'projects')]) {
    rmSync(path, { recursive: true, force: true })
  }
}
