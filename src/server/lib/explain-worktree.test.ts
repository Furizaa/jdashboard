import type { SpawnSyncReturns } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  explainWorktreePath,
  explainWorktreeRoot,
  mergeRequestHeadRef,
  runDiscardExplainWorktree,
  runPrepareExplainWorktree,
} from './explain-worktree'
import { worktreePathFor } from './open-workspace'

const HOME = '/home/dev'
const REPO = '/home/dev/projects/dr-web'
const IID = 4211
const SHA = 'deadbeefcafe0123456789abcdef0123456789ab'
const TARGET = 'develop'

function ok(stdout = ''): SpawnSyncReturns<string> {
  return { pid: 1, output: ['', stdout, ''], stdout, stderr: '', status: 0, signal: null }
}

function fail(stderr = 'boom'): SpawnSyncReturns<string> {
  return { pid: 1, output: ['', '', stderr], stdout: '', stderr, status: 1, signal: null }
}

type SpawnCall = { command: string; args: ReadonlyArray<string> }

function recorder(responses: ReadonlyArray<SpawnSyncReturns<string>>) {
  const calls: SpawnCall[] = []
  let idx = 0
  const spawn = (command: string, args: ReadonlyArray<string>) => {
    calls.push({ command, args })
    const response = responses[idx]
    idx += 1
    if (response === undefined) {
      throw new Error(`unexpected spawn call #${idx}: ${command} ${args.join(' ')}`)
    }
    return response
  }
  return { spawn, calls }
}

const prepare = (responses: ReadonlyArray<SpawnSyncReturns<string>>, worktreeExists: boolean) => {
  const { spawn, calls } = recorder(responses)
  const result = runPrepareExplainWorktree(
    { iid: IID, headSha: SHA, targetBranch: TARGET },
    { homeDir: HOME, exists: () => worktreeExists, spawn },
  )
  return { result, calls }
}

describe('explainWorktreePath', () => {
  it('lives under a root of its own, never the workspace root', () => {
    expect(explainWorktreePath(IID, HOME)).toBe(
      '/home/dev/projects/worktrees/dr-web-explain/mr-4211',
    )
    // The guarantee that makes "close discards the worktree" safe: no iid can
    // produce a path inside the tree where the user's own work lives.
    expect(explainWorktreeRoot(HOME)).not.toBe(`${HOME}/projects/worktrees/dr-web`)
    expect(explainWorktreePath(IID, HOME).startsWith(`${explainWorktreeRoot(HOME)}/`)).toBe(true)
    expect(explainWorktreePath(IID, HOME)).not.toContain(worktreePathFor('HDR-1', HOME))
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects iid %p', (iid) => {
    expect(() => explainWorktreePath(iid, HOME)).toThrow('must be a positive integer')
  })
})

describe('mergeRequestHeadRef', () => {
  it('addresses the MR head server-side rather than by branch name', () => {
    expect(mergeRequestHeadRef(IID)).toBe('refs/merge-requests/4211/head')
  })
})

describe('runPrepareExplainWorktree — worktree missing', () => {
  it('fetches the MR head and the target branch, then adds a detached worktree', () => {
    const { result, calls } = prepare([ok(), ok(), ok()], false)
    expect(result).toEqual({
      ok: true,
      worktreePath: '/home/dev/projects/worktrees/dr-web-explain/mr-4211',
    })
    expect(calls).toEqual([
      { command: 'git', args: ['-C', REPO, 'fetch', 'origin', 'refs/merge-requests/4211/head'] },
      { command: 'git', args: ['-C', REPO, 'fetch', 'origin', TARGET] },
      {
        command: 'git',
        args: [
          '-C',
          REPO,
          'worktree',
          'add',
          '--detach',
          '/home/dev/projects/worktrees/dr-web-explain/mr-4211',
          SHA,
        ],
      },
    ])
  })

  it('fetches the target branch the MR names, not an assumed develop', () => {
    const { spawn, calls } = recorder([ok(), ok(), ok()])
    runPrepareExplainWorktree(
      { iid: IID, headSha: SHA, targetBranch: 'release/25.3' },
      { homeDir: HOME, exists: () => false, spawn },
    )
    expect(calls[1]).toEqual({
      command: 'git',
      args: ['-C', REPO, 'fetch', 'origin', 'release/25.3'],
    })
  })

  it('returns ok:false with stderr when the MR-head fetch fails', () => {
    const { result, calls } = prepare([fail('no such ref')], false)
    expect(result).toEqual({ ok: false, error: { message: 'no such ref' } })
    // Nothing after a failed fetch — no worktree is added from a tree we could
    // not prove we have.
    expect(calls).toHaveLength(1)
  })

  it('returns ok:false when the target-branch fetch fails', () => {
    const { result, calls } = prepare([ok(), fail('target gone')], false)
    expect(result).toEqual({ ok: false, error: { message: 'target gone' } })
    expect(calls).toHaveLength(2)
  })

  it('returns ok:false when worktree add fails', () => {
    const { result } = prepare([ok(), ok(), fail('already checked out')], false)
    expect(result).toEqual({ ok: false, error: { message: 'already checked out' } })
  })

  it('describes a failure with no stderr by naming the step and the exit code', () => {
    const silent: SpawnSyncReturns<string> = {
      pid: 1,
      output: ['', '', ''],
      stdout: '',
      stderr: '',
      status: 128,
      signal: null,
    }
    const { result } = prepare([silent], false)
    expect(result).toEqual({ ok: false, error: { message: 'git fetch exited with code 128' } })
  })
})

describe('runPrepareExplainWorktree — worktree already present', () => {
  it('removes the stale checkout first, then prepares the new head', () => {
    const { result, calls } = prepare([ok(), ok(), ok(), ok()], true)
    expect(result.ok).toBe(true)
    // A re-run exists because the author pushed: reusing the old tree would
    // describe the wrong commit.
    expect(calls[0]).toEqual({
      command: 'git',
      args: [
        '-C',
        REPO,
        'worktree',
        'remove',
        '--force',
        '/home/dev/projects/worktrees/dr-web-explain/mr-4211',
      ],
    })
    expect(calls).toHaveLength(4)
  })

  it('returns ok:false when the stale worktree cannot be removed', () => {
    const { result, calls } = prepare([fail('worktree is locked')], true)
    expect(result).toEqual({ ok: false, error: { message: 'worktree is locked' } })
    expect(calls).toHaveLength(1)
  })
})

describe('runDiscardExplainWorktree', () => {
  it('fires a background removal when the worktree is present', () => {
    const removals: Array<[string, string]> = []
    const result = runDiscardExplainWorktree(IID, {
      homeDir: HOME,
      exists: (p) => p === explainWorktreePath(IID, HOME),
      removeWorktreeInBackground: (repo, path) => removals.push([repo, path]),
    })
    expect(result).toEqual({ removed: true })
    expect(removals).toEqual([[REPO, '/home/dev/projects/worktrees/dr-web-explain/mr-4211']])
  })

  it('reports nothing removed — and never spawns — when the worktree is absent', () => {
    // Closing a tab whose run never got past `preparing` must still close.
    let called = false
    const result = runDiscardExplainWorktree(IID, {
      homeDir: HOME,
      exists: () => false,
      removeWorktreeInBackground: () => {
        called = true
      },
    })
    expect(result).toEqual({ removed: false })
    expect(called).toBe(false)
  })
})
