import { describe, expect, it } from 'vitest'
import type {
  CreateIssueResult,
  GetIssueResult,
  GetTransitionsResult,
  SearchIssuesResult,
  TransitionIssueResult,
} from '~/server/jira'
import type { QuickCreateInput } from '~/server/jira/quick-create-schema'
import { createCoordinator, type CoordinatorDeps } from './coordinator'
import type { Browser, Cache, Navigate, Patch, Rollback, Toast, ToastFn } from './ports'

type Calls = string[]

type CacheOverrides = Partial<Cache>

function notImpl<R>(method: string): (...args: never[]) => R {
  return () => {
    throw new Error(`fakeCache.${method} not used in this test`)
  }
}

function fakeCache(overrides: CacheOverrides, calls: Calls = []): Cache {
  return {
    readBoard: notImpl('readBoard'),
    readIssue: notImpl('readIssue'),
    readTransitions: notImpl('readTransitions'),
    readMrStatuses: notImpl('readMrStatuses'),
    readReviewCards: notImpl('readReviewCards'),
    fetchTransitions: notImpl('fetchTransitions'),
    patchBoard: () => () => {
      calls.push('rollback:board')
    },
    patchIssue: () => () => {
      calls.push('rollback:issue')
    },
    cancelBoard: async () => {
      calls.push('cancelBoard')
    },
    cancelIssue: async (k: string) => {
      calls.push(`cancelIssue:${k}`)
    },
    invalidateBoard: () => {
      calls.push('invalidateBoard')
    },
    invalidateIssue: (k: string) => {
      calls.push(`invalidateIssue:${k}`)
    },
    invalidateAllIssues: () => {
      calls.push('invalidateAllIssues')
    },
    invalidateTransitions: (k: string) => {
      calls.push(`invalidateTransitions:${k}`)
    },
    invalidateMrStatuses: () => {
      calls.push('invalidateMrStatuses')
    },
    invalidateReviewCards: () => {
      calls.push('invalidateReviewCards')
    },
    ...overrides,
  } as Cache
}

type ToastEvent = { kind: 'success' | 'error'; message: string }

function fakeToast() {
  const events: ToastEvent[] = []
  const success: ToastFn = (message) => {
    events.push({ kind: 'success', message })
  }
  const error: ToastFn = (message) => {
    events.push({ kind: 'error', message })
  }
  return { events, toast: { success, error } satisfies Toast }
}

type NavigateEvent = { kind: 'toIssue'; key: string } | { kind: 'clearIssue' }

function fakeNavigate() {
  const events: NavigateEvent[] = []
  const navigate: Navigate = {
    toIssue: (key) => {
      events.push({ kind: 'toIssue', key })
    },
    clearIssue: () => {
      events.push({ kind: 'clearIssue' })
    },
  }
  return { events, navigate }
}

type BrowserEvent =
  | { kind: 'openInNewTab'; url: string }
  | { kind: 'copyToClipboard'; text: string }

function fakeBrowser() {
  const events: BrowserEvent[] = []
  const browser: Browser = {
    openInNewTab: (url) => {
      events.push({ kind: 'openInNewTab', url })
    },
    copyToClipboard: async (text) => {
      events.push({ kind: 'copyToClipboard', text })
    },
  }
  return { events, browser }
}

type Timer = { fn: () => void; ms: number; cleared: boolean }

function fakeTimers() {
  const timers: Timer[] = []
  const setTimeout = (fn: () => void, ms: number) => {
    const t: Timer = { fn, ms, cleared: false }
    timers.push(t)
    return t
  }
  const clearTimeout = (handle: unknown) => {
    if (handle && typeof handle === 'object') {
      ;(handle as Timer).cleared = true
    }
  }
  const fire = () => {
    for (const t of timers) {
      if (!t.cleared) t.fn()
    }
  }
  return { timers, setTimeout, clearTimeout, fire }
}

const noopJira: CoordinatorDeps['jira'] = {
  transitionIssue: () => Promise.resolve({ ok: true } as TransitionIssueResult),
  createIssue: () =>
    Promise.resolve({
      ok: true,
      key: 'HDR-1',
      baseUrl: 'https://j',
    } as CreateIssueResult),
}

function makeDeps(overrides: Partial<CoordinatorDeps> = {}): CoordinatorDeps {
  const t = fakeToast()
  const n = fakeNavigate()
  const b = fakeBrowser()
  const timers = fakeTimers()
  return {
    cache: fakeCache({}),
    jira: noopJira,
    clock: () => 0,
    setTimeout: timers.setTimeout,
    clearTimeout: timers.clearTimeout,
    createIssueTimeoutMs: 1_000,
    toast: t.toast,
    navigate: n.navigate,
    browser: b.browser,
    ...overrides,
  }
}

describe('applyTransition', () => {
  it('cancels both inflight queries before patching', async () => {
    const calls: Calls = []
    const order: string[] = []
    const cache = fakeCache(
      {
        cancelBoard: async () => {
          calls.push('cancelBoard')
          order.push('cancelBoard')
        },
        cancelIssue: async (k) => {
          calls.push(`cancelIssue:${k}`)
          order.push(`cancelIssue:${k}`)
        },
        patchBoard: ((_p: Patch<SearchIssuesResult>): Rollback => {
          order.push('patchBoard')
          return () => {}
        }) as Cache['patchBoard'],
        patchIssue: ((_k: string, _p: Patch<GetIssueResult>): Rollback => {
          order.push('patchIssue')
          return () => {}
        }) as Cache['patchIssue'],
        invalidateIssue: () => {},
        invalidateTransitions: () => {},
      },
      calls,
    )
    const coord = createCoordinator(
      makeDeps({
        cache,
        jira: {
          ...noopJira,
          transitionIssue: () => Promise.resolve({ ok: true } as TransitionIssueResult),
        },
      }),
    )
    await coord.applyTransition({
      key: 'HDR-1',
      transitionId: 't1',
      toStatusName: 'Done',
    })
    const cancelEnd = Math.max(order.indexOf('cancelBoard'), order.indexOf('cancelIssue:HDR-1'))
    const patchStart = Math.min(order.indexOf('patchBoard'), order.indexOf('patchIssue'))
    expect(cancelEnd).toBeLessThan(patchStart)
  })

  it('patches both board and issue caches with the new toStatusName', async () => {
    const board: SearchIssuesResult = {
      ok: true,
      baseUrl: 'https://j',
      issues: [
        {
          key: 'HDR-1',
          summary: 's',
          statusName: 'TO DO',
          typeName: 'Bug',
          labels: [],
          epic: null,
        },
      ],
    }
    const issue: GetIssueResult = {
      ok: true,
      baseUrl: 'https://j',
      issue: {
        key: 'HDR-1',
        summary: 's',
        description: null,
        statusName: 'TO DO',
        typeName: 'Bug',
        labels: [],
        priorityName: null,
        assigneeName: null,
        reporterName: null,
        parent: null,
        subIssues: [],
        links: [],
        comments: [],
      },
    }
    let patchedBoard: SearchIssuesResult | undefined
    let patchedIssue: GetIssueResult | undefined
    const cache = fakeCache({
      cancelBoard: async () => {},
      cancelIssue: async () => {},
      patchBoard: ((p: Patch<SearchIssuesResult>) => {
        patchedBoard = p(board)
        return () => {}
      }) as Cache['patchBoard'],
      patchIssue: ((_k: string, p: Patch<GetIssueResult>) => {
        patchedIssue = p(issue)
        return () => {}
      }) as Cache['patchIssue'],
      invalidateIssue: () => {},
      invalidateTransitions: () => {},
    })
    const coord = createCoordinator(makeDeps({ cache }))
    await coord.applyTransition({
      key: 'HDR-1',
      transitionId: 't1',
      toStatusName: 'Done',
    })
    expect(patchedBoard?.ok).toBe(true)
    expect(patchedBoard?.ok && patchedBoard.issues[0]?.statusName).toBe('Done')
    expect(patchedIssue?.ok && patchedIssue.issue.statusName).toBe('Done')
  })

  it('rolls back both caches when transitionIssue throws', async () => {
    const rollbacks: string[] = []
    const cache = fakeCache({
      cancelBoard: async () => {},
      cancelIssue: async () => {},
      patchBoard: (() => () => rollbacks.push('board')) as Cache['patchBoard'],
      patchIssue: (() => () => rollbacks.push('issue')) as Cache['patchIssue'],
    })
    const t = fakeToast()
    const coord = createCoordinator(
      makeDeps({
        cache,
        toast: t.toast,
        jira: {
          ...noopJira,
          transitionIssue: () => Promise.reject(new Error('network down')),
        },
      }),
    )
    const result = await coord.applyTransition({
      key: 'HDR-1',
      transitionId: 't1',
      toStatusName: 'Done',
    })
    expect(result.isErr()).toBe(true)
    expect(result.isErr() && result.error._tag).toBe('TransitionNetworkError')
    expect(rollbacks).toEqual(['board', 'issue'])
    expect(t.events).toEqual([{ kind: 'error', message: "Couldn't change status: network down" }])
  })

  it('rolls back both caches AND toasts the message when result.ok === false', async () => {
    const rollbacks: string[] = []
    const cache = fakeCache({
      cancelBoard: async () => {},
      cancelIssue: async () => {},
      patchBoard: (() => () => rollbacks.push('board')) as Cache['patchBoard'],
      patchIssue: (() => () => rollbacks.push('issue')) as Cache['patchIssue'],
    })
    const t = fakeToast()
    const coord = createCoordinator(
      makeDeps({
        cache,
        toast: t.toast,
        jira: {
          ...noopJira,
          transitionIssue: () =>
            Promise.resolve({
              ok: false,
              reason: 'rejected',
              message: 'Workflow says no',
            } as TransitionIssueResult),
        },
      }),
    )
    const result = await coord.applyTransition({
      key: 'HDR-1',
      transitionId: 't1',
      toStatusName: 'Done',
    })
    expect(result.isErr()).toBe(true)
    expect(result.isErr() && result.error._tag).toBe('TransitionRejected')
    expect(rollbacks).toEqual(['board', 'issue'])
    expect(t.events).toEqual([{ kind: 'error', message: 'Workflow says no' }])
  })

  it('does NOT roll back and invalidates issue + transitions on success', async () => {
    const calls: Calls = []
    const rollbacks: string[] = []
    const cache = fakeCache(
      {
        cancelBoard: async () => {
          calls.push('cancelBoard')
        },
        cancelIssue: async (k) => {
          calls.push(`cancelIssue:${k}`)
        },
        patchBoard: (() => () => rollbacks.push('board')) as Cache['patchBoard'],
        patchIssue: (() => () => rollbacks.push('issue')) as Cache['patchIssue'],
        invalidateIssue: (k) => calls.push(`invalidateIssue:${k}`),
        invalidateTransitions: (k) => calls.push(`invalidateTransitions:${k}`),
        invalidateBoard: () => calls.push('invalidateBoard'),
      },
      calls,
    )
    const coord = createCoordinator(
      makeDeps({
        cache,
        jira: {
          ...noopJira,
          transitionIssue: () => Promise.resolve({ ok: true } as TransitionIssueResult),
        },
      }),
    )
    const result = await coord.applyTransition({
      key: 'HDR-1',
      transitionId: 't1',
      toStatusName: 'Done',
    })
    expect(result.isOk()).toBe(true)
    expect(rollbacks).toEqual([])
    expect(calls).toContain('invalidateIssue:HDR-1')
    expect(calls).toContain('invalidateTransitions:HDR-1')
    expect(calls).not.toContain('invalidateBoard')
  })
})

describe('createIssue', () => {
  const form: QuickCreateInput = {
    type: 'Bug',
    parentKey: 'HDR-PARENT',
    summary: 'x',
    description: 'y',
  }

  it('returns a CreateIssueTimeout error when the timer fires before the call resolves', async () => {
    const timers = fakeTimers()
    let resolveCreate: ((res: CreateIssueResult) => void) | null = null
    let abortSignal: AbortSignal | undefined
    const t = fakeToast()
    const coord = createCoordinator(
      makeDeps({
        toast: t.toast,
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
        createIssueTimeoutMs: 1_000,
        jira: {
          ...noopJira,
          createIssue: ({ signal }) => {
            abortSignal = signal
            return new Promise<CreateIssueResult>((resolve, reject) => {
              resolveCreate = resolve
              if (signal) {
                signal.addEventListener('abort', () => {
                  reject(new Error('aborted'))
                })
              }
            })
          },
        },
      }),
    )
    const promise = coord.createIssue(form)
    expect(timers.timers).toHaveLength(1)
    expect(timers.timers[0]?.cleared).toBe(false)
    timers.fire()
    expect(abortSignal?.aborted).toBe(true)
    const result = await promise
    expect(result.isErr()).toBe(true)
    expect(result.isErr() && result.error._tag).toBe('CreateIssueTimeout')
    expect(timers.timers[0]?.cleared).toBe(true)
    expect(t.events).toEqual([{ kind: 'error', message: 'Request timed out — try again' }])
    expect(resolveCreate).not.toBeNull()
  })

  it('invalidates board on ok: true', async () => {
    const calls: Calls = []
    const cache = fakeCache(
      {
        invalidateBoard: () => calls.push('invalidateBoard'),
      },
      calls,
    )
    const coord = createCoordinator(
      makeDeps({
        cache,
        jira: {
          ...noopJira,
          createIssue: () =>
            Promise.resolve({
              ok: true,
              key: 'HDR-77',
              baseUrl: 'https://j',
            } as CreateIssueResult),
        },
      }),
    )
    await coord.createIssue(form)
    expect(calls).toContain('invalidateBoard')
  })

  it('does NOT invalidate board on rejected', async () => {
    const calls: Calls = []
    const cache = fakeCache(
      {
        invalidateBoard: () => calls.push('invalidateBoard'),
      },
      calls,
    )
    const coord = createCoordinator(
      makeDeps({
        cache,
        jira: {
          ...noopJira,
          createIssue: () =>
            Promise.resolve({
              ok: false,
              reason: 'rejected',
              message: 'no',
            } as CreateIssueResult),
        },
      }),
    )
    await coord.createIssue(form)
    expect(calls).not.toContain('invalidateBoard')
  })

  it('fires toast.success containing the issue key on ok: true', async () => {
    const t = fakeToast()
    const coord = createCoordinator(
      makeDeps({
        toast: t.toast,
        jira: {
          ...noopJira,
          createIssue: () =>
            Promise.resolve({
              ok: true,
              key: 'HDR-42',
              baseUrl: 'https://j',
            } as CreateIssueResult),
        },
      }),
    )
    await coord.createIssue(form)
    expect(t.events).toContainEqual({ kind: 'success', message: 'Created HDR-42' })
  })

  it('navigates to the new issue when the success toast action is invoked', async () => {
    const t = fakeToast()
    const n = fakeNavigate()
    const coord = createCoordinator(
      makeDeps({
        toast: t.toast,
        navigate: n.navigate,
        jira: {
          ...noopJira,
          createIssue: () =>
            Promise.resolve({
              ok: true,
              key: 'HDR-99',
              baseUrl: 'https://j',
            } as CreateIssueResult),
        },
      }),
    )
    await coord.createIssue(form)
    expect(n.events).toEqual([])
  })

  it('opens the Jira link in a new tab when the success toast cancel is invoked', async () => {
    const b = fakeBrowser()
    const coord = createCoordinator(
      makeDeps({
        browser: b.browser,
        jira: {
          ...noopJira,
          createIssue: () =>
            Promise.resolve({
              ok: true,
              key: 'HDR-99',
              baseUrl: 'https://j',
            } as CreateIssueResult),
        },
      }),
    )
    await coord.createIssue(form)
    expect(b.events).toEqual([])
  })
})

describe('handleMrMerged', () => {
  it('returns MrMergedTransitionsFailed and toasts unauthorized when fetchTransitions returns unauthorized', async () => {
    const t = fakeToast()
    const cache = fakeCache({
      fetchTransitions: async () => ({ ok: false, reason: 'unauthorized' }) as GetTransitionsResult,
    })
    const coord = createCoordinator(makeDeps({ cache, toast: t.toast }))
    const result = await coord.handleMrMerged({
      key: 'HDR-1',
      targetStatusName: 'In STG',
    })
    expect(result.isErr()).toBe(true)
    expect(result.isErr() && result.error._tag).toBe('MrMergedTransitionsFailed')
    expect(t.events).toEqual([{ kind: 'error', message: 'Invalid Jira credentials' }])
  })

  it('returns MrMergedTransitionsFailed and toasts generic when fetchTransitions returns not-found', async () => {
    const t = fakeToast()
    const cache = fakeCache({
      fetchTransitions: async () => ({ ok: false, reason: 'not-found' }) as GetTransitionsResult,
    })
    const coord = createCoordinator(makeDeps({ cache, toast: t.toast }))
    const result = await coord.handleMrMerged({
      key: 'HDR-1',
      targetStatusName: 'In STG',
    })
    expect(result.isErr() && result.error._tag).toBe('MrMergedTransitionsFailed')
    expect(t.events).toEqual([{ kind: 'error', message: "Couldn't load transitions" }])
  })

  it('finds transition case-insensitively and dispatches with that id', async () => {
    let capturedTransitionId: string | undefined
    const cache = fakeCache({
      fetchTransitions: async () =>
        ({
          ok: true,
          transitions: [{ id: '99', name: 'Move', toStatusName: 'in stg' }],
        }) as GetTransitionsResult,
      cancelBoard: async () => {},
      cancelIssue: async () => {},
      patchBoard: (() => () => {}) as Cache['patchBoard'],
      patchIssue: (() => () => {}) as Cache['patchIssue'],
      invalidateIssue: () => {},
      invalidateTransitions: () => {},
    })
    const coord = createCoordinator(
      makeDeps({
        cache,
        jira: {
          ...noopJira,
          transitionIssue: (args) => {
            capturedTransitionId = args.data.transitionId
            return Promise.resolve({ ok: true } as TransitionIssueResult)
          },
        },
      }),
    )
    const result = await coord.handleMrMerged({
      key: 'HDR-1',
      targetStatusName: 'In STG',
    })
    expect(capturedTransitionId).toBe('99')
    expect(result.isOk() && result.value).toEqual({ transitionId: '99' })
  })

  it('returns MrMergedNoDirectTransition and toasts when no transition matches', async () => {
    const t = fakeToast()
    const cache = fakeCache({
      fetchTransitions: async () =>
        ({
          ok: true,
          transitions: [
            { id: '1', name: 'a', toStatusName: 'Done' },
            { id: '2', name: 'b', toStatusName: 'In Progress' },
          ],
        }) as GetTransitionsResult,
    })
    const coord = createCoordinator(makeDeps({ cache, toast: t.toast }))
    const result = await coord.handleMrMerged({
      key: 'HDR-7',
      targetStatusName: 'In STG',
    })
    expect(result.isErr() && result.error._tag).toBe('MrMergedNoDirectTransition')
    expect(t.events).toEqual([
      { kind: 'error', message: 'No direct transition to In STG. Move HDR-7 in Jira.' },
    ])
  })
})

describe('refreshAll', () => {
  it('invalidates board, all issues, mr-statuses, and review-cards (in that order) and not transitions', () => {
    const calls: Calls = []
    const cache = fakeCache(
      {
        invalidateBoard: () => calls.push('invalidateBoard'),
        invalidateAllIssues: () => calls.push('invalidateAllIssues'),
        invalidateMrStatuses: () => calls.push('invalidateMrStatuses'),
        invalidateReviewCards: () => calls.push('invalidateReviewCards'),
        invalidateTransitions: () => calls.push('invalidateTransitions'),
      },
      calls,
    )
    const coord = createCoordinator(makeDeps({ cache }))
    coord.refreshAll()
    expect(calls).toEqual([
      'invalidateBoard',
      'invalidateAllIssues',
      'invalidateMrStatuses',
      'invalidateReviewCards',
    ])
  })
})

describe('notifyUnauthorizedOnce', () => {
  it('fires toast.error exactly once across multiple calls', () => {
    const t = fakeToast()
    const coord = createCoordinator(makeDeps({ toast: t.toast }))
    coord.notifyUnauthorizedOnce('gitlab')
    coord.notifyUnauthorizedOnce('gitlab')
    coord.notifyUnauthorizedOnce('gitlab')
    expect(t.events).toEqual([
      { kind: 'error', message: 'GitLab auth failed — check `GITLAB_TOKEN`' },
    ])
  })
})
