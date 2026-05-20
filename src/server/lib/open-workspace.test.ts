import type { SpawnSyncReturns } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  buildLayoutJson,
  findWorkspaceRefByName,
  runCheckWorktree,
  runOpenInWorkspace,
  worktreePathFor,
} from './open-workspace'

const HOME = '/home/dev'

function ok(stdout = ''): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: ['', stdout, ''],
    stdout,
    stderr: '',
    status: 0,
    signal: null,
  }
}

function fail(stderr = 'boom'): SpawnSyncReturns<string> {
  return {
    pid: 1,
    output: ['', '', stderr],
    stdout: '',
    stderr,
    status: 1,
    signal: null,
  }
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

describe('checkWorktree', () => {
  it('returns worktreeExists=true when the directory is present', () => {
    const result = runCheckWorktree('HDR-1', {
      homeDir: HOME,
      exists: (p) => p === worktreePathFor('HDR-1', HOME),
    })
    expect(result).toEqual({ worktreeExists: true })
  })

  it('returns worktreeExists=false when the directory is absent', () => {
    const result = runCheckWorktree('HDR-1', { homeDir: HOME, exists: () => false })
    expect(result).toEqual({ worktreeExists: false })
  })
})

describe('findWorkspaceRefByName', () => {
  const listing = [
    '  workspace:1  Root',
    '* workspace:2  Clashboard  [selected]',
    '  workspace:3  Lumen',
    '  workspace:4  GeoCloud ROOT',
    '  workspace:9  GeoCloud HDR-123',
  ].join('\n')

  it('returns the ref when the name matches exactly', () => {
    expect(findWorkspaceRefByName(listing, 'GeoCloud HDR-123')).toBe('workspace:9')
  })

  it('matches names that contain spaces', () => {
    expect(findWorkspaceRefByName(listing, 'GeoCloud ROOT')).toBe('workspace:4')
  })

  it('tolerates the selection indicator and bracket annotations', () => {
    expect(findWorkspaceRefByName(listing, 'Clashboard')).toBe('workspace:2')
  })

  it('returns null when no row matches', () => {
    expect(findWorkspaceRefByName(listing, 'GeoCloud HDR-999')).toBeNull()
  })
})

describe('openInWorkspace — worktree missing', () => {
  const baseDeps = { homeDir: HOME, exists: () => false }

  it('runs git fetch, worktree add, upstream config, then cmux list + new-workspace', () => {
    const { spawn, calls } = recorder([ok(), ok(), ok(), ok(), ok('  workspace:1  Other\n'), ok()])
    const result = runOpenInWorkspace('HDR-7', 'feat/HDR-7-thing', { ...baseDeps, spawn })

    expect(result).toEqual({ ok: true })
    expect(calls).toHaveLength(6)
    expect(calls[0]).toEqual({
      command: 'git',
      args: ['-C', `${HOME}/projects/dr-web`, 'fetch', 'origin', 'develop'],
    })
    expect(calls[1]).toEqual({
      command: 'git',
      args: [
        '-C',
        `${HOME}/projects/dr-web`,
        'worktree',
        'add',
        `${HOME}/projects/worktrees/dr-web/HDR-7`,
        '-b',
        'feat/HDR-7-thing',
        'origin/develop',
      ],
    })
    expect(calls[2]).toEqual({
      command: 'git',
      args: ['-C', `${HOME}/projects/dr-web`, 'config', 'branch.feat/HDR-7-thing.remote', 'origin'],
    })
    expect(calls[3]).toEqual({
      command: 'git',
      args: [
        '-C',
        `${HOME}/projects/dr-web`,
        'config',
        'branch.feat/HDR-7-thing.merge',
        'refs/heads/feat/HDR-7-thing',
      ],
    })
    expect(calls[4]).toEqual({ command: 'cmux', args: ['list-workspaces'] })
    expect(calls[5]?.command).toBe('cmux')
    expect(calls[5]?.args.slice(0, 2)).toEqual(['new-workspace', '--name'])
    expect(calls[5]?.args).toContain('GeoCloud HDR-7')
    expect(calls[5]?.args).toContain(`${HOME}/projects/worktrees/dr-web/HDR-7`)
    expect(calls[5]?.args).toContain(buildLayoutJson())
  })

  it('returns ok:false with stderr when git fetch fails', () => {
    const { spawn } = recorder([fail('network down')])
    const result = runOpenInWorkspace('HDR-7', 'feat/HDR-7-thing', { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('network down')
  })

  it('returns ok:false when branchName is missing and worktree is absent', () => {
    const { spawn, calls } = recorder([])
    const result = runOpenInWorkspace('HDR-7', undefined, { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('returns ok:false when git worktree add fails', () => {
    const { spawn } = recorder([ok(), fail('already exists')])
    const result = runOpenInWorkspace('HDR-7', 'feat/HDR-7-thing', { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('already exists')
  })

  it('returns ok:false when configuring upstream fails', () => {
    const { spawn } = recorder([ok(), ok(), fail('config locked')])
    const result = runOpenInWorkspace('HDR-7', 'feat/HDR-7-thing', { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('config locked')
  })
})

describe('openInWorkspace — worktree exists', () => {
  const baseDeps = { homeDir: HOME, exists: () => true }

  it('skips git, finds existing workspace, and selects it', () => {
    const listing = '  workspace:9  GeoCloud HDR-7\n'
    const { spawn, calls } = recorder([ok(listing), ok()])
    const result = runOpenInWorkspace('HDR-7', undefined, { ...baseDeps, spawn })

    expect(result).toEqual({ ok: true })
    expect(calls).toEqual([
      { command: 'cmux', args: ['list-workspaces'] },
      { command: 'cmux', args: ['select-workspace', '--workspace', 'workspace:9'] },
    ])
  })

  it('creates a new workspace when no match is found', () => {
    const listing = '  workspace:1  Other\n'
    const { spawn, calls } = recorder([ok(listing), ok()])
    const result = runOpenInWorkspace('HDR-7', undefined, { ...baseDeps, spawn })

    expect(result).toEqual({ ok: true })
    expect(calls[1]?.command).toBe('cmux')
    expect(calls[1]?.args[0]).toBe('new-workspace')
    expect(calls[1]?.args).toContain('GeoCloud HDR-7')
  })

  it('returns ok:false when cmux list-workspaces fails', () => {
    const { spawn } = recorder([fail('socket error')])
    const result = runOpenInWorkspace('HDR-7', undefined, { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('socket error')
  })

  it('returns ok:false when cmux new-workspace fails', () => {
    const { spawn } = recorder([ok(''), fail('layout invalid')])
    const result = runOpenInWorkspace('HDR-7', undefined, { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('layout invalid')
  })

  it('returns ok:false when cmux select-workspace fails', () => {
    const { spawn } = recorder([ok('  workspace:9  GeoCloud HDR-7\n'), fail('no such workspace')])
    const result = runOpenInWorkspace('HDR-7', undefined, { ...baseDeps, spawn })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe('no such workspace')
  })
})

describe('buildLayoutJson', () => {
  it('encodes the vertical 70/30 layout with the expected surfaces', () => {
    const layout = JSON.parse(buildLayoutJson()) as {
      direction: string
      split: number
      children: ReadonlyArray<unknown>
    }
    expect(layout.direction).toBe('vertical')
    expect(layout.split).toBeCloseTo(0.7)
    expect(layout.children).toHaveLength(2)
    expect(buildLayoutJson()).toContain('claude --dangerously-skip-permissions')
    expect(buildLayoutJson()).toContain('nvim .')
    expect(buildLayoutJson()).toContain('lazygit')
    expect(buildLayoutJson()).toContain('lumen diff')
    expect(buildLayoutJson()).toContain('pnpm i && nx run-many -t i18n-compile')
  })
})
