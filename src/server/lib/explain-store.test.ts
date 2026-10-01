import { describe, expect, it } from 'vitest'
import {
  EXPLAIN_RECORD_VERSION,
  deleteExplainRecord,
  explainFilePath,
  iidFromFileName,
  listExplainRecords,
  readExplainRecord,
  writeExplainRecord,
  type ExplainRecord,
  type ExplainStoreDeps,
} from './explain-store'
import type { ExplainReport } from './explain-report'

const HOME = '/home/dev'

const REPORT: ExplainReport = {
  version: 1,
  blocks: [{ type: 'verdict', verdict: 'sound', headline: 'Fits the system' }],
}

function record(overrides: Partial<ExplainRecord> & { iid: number }): ExplainRecord {
  return {
    version: EXPLAIN_RECORD_VERSION,
    iid: overrides.iid,
    title: overrides.title ?? `MR ${overrides.iid}`,
    webUrl: overrides.webUrl ?? `https://gitlab/p/-/merge_requests/${overrides.iid}`,
    sourceBranch: overrides.sourceBranch ?? 'feat/x',
    targetBranch: overrides.targetBranch ?? 'develop',
    headSha: overrides.headSha ?? 'sha',
    issueKey: overrides.issueKey ?? null,
    startedAt: overrides.startedAt ?? '2026-10-01T09:00:00.000Z',
    generatedAt: overrides.generatedAt ?? null,
    report: overrides.report ?? null,
  }
}

/** In-memory fs, the hand-rolled-fake pattern `notes-store.test.ts` uses. */
function fakeFs(seed: Readonly<Record<string, string>> = {}) {
  const files = new Map<string, string>(Object.entries(seed))
  const dirs = new Set<string>()
  const deps: ExplainStoreDeps = {
    homeDir: HOME,
    readFile: (path) => {
      const content = files.get(path)
      return content === undefined
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(content)
    },
    writeFile: (path, data) => {
      files.set(path, data)
      return Promise.resolve()
    },
    mkdir: (path) => {
      dirs.add(path)
      return Promise.resolve()
    },
    deleteFile: (path) =>
      files.delete(path) ? Promise.resolve() : Promise.reject(new Error(`ENOENT: ${path}`)),
    readDir: (path) => {
      const prefix = `${path}/`
      const names = [...files.keys()]
        .filter((f) => f.startsWith(prefix))
        .map((f) => f.slice(prefix.length))
      return names.length === 0 && !dirs.has(path)
        ? Promise.reject(new Error(`ENOENT: ${path}`))
        : Promise.resolve(names)
    },
  }
  return { deps, files, dirs }
}

describe('explainFilePath', () => {
  it('is one json file per merge request under ~/.clashboard/explain', () => {
    expect(explainFilePath(HOME, 4211)).toBe('/home/dev/.clashboard/explain/mr-4211.json')
  })

  it.each([0, -1, 2.5, Number.NaN])('rejects iid %p rather than building a path', (iid) => {
    expect(() => explainFilePath(HOME, iid)).toThrow('must be a positive integer')
  })
})

describe('iidFromFileName', () => {
  it.each([
    ['mr-1.json', 1],
    ['mr-4211.json', 4211],
  ])('reads %s as %i', (name, iid) => {
    expect(iidFromFileName(name)).toBe(iid)
  })

  it.each([
    'mr-.json',
    'mr-0.json',
    'mr-01.json',
    'mr-x.json',
    'notes.json',
    'mr-1.txt',
    '.DS_Store',
  ])('ignores %s', (name) => {
    expect(iidFromFileName(name)).toBeNull()
  })
})

describe('writeExplainRecord / readExplainRecord', () => {
  it('round-trips a pending record — the tab exists before the report does', async () => {
    const { deps } = fakeFs()
    const pending = record({ iid: 7, issueKey: 'HDR-7' })
    await writeExplainRecord(pending, deps)
    expect(await readExplainRecord(7, deps)).toEqual(pending)
  })

  it('round-trips a finished record', async () => {
    const { deps } = fakeFs()
    const done = record({
      iid: 7,
      report: REPORT,
      generatedAt: '2026-10-01T09:11:00.000Z',
    })
    await writeExplainRecord(done, deps)
    expect(await readExplainRecord(7, deps)).toEqual(done)
  })

  it('creates the directory before writing', async () => {
    const { deps, dirs } = fakeFs()
    await writeExplainRecord(record({ iid: 7 }), deps)
    expect(dirs.has('/home/dev/.clashboard/explain')).toBe(true)
  })

  it('writes pretty JSON with a trailing newline, so the file reads on its own', async () => {
    const { deps, files } = fakeFs()
    await writeExplainRecord(record({ iid: 7 }), deps)
    const raw = files.get('/home/dev/.clashboard/explain/mr-7.json') ?? ''
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).toContain('\n  "iid": 7')
  })

  it('reads a missing file as absent — the no-tab-yet case', async () => {
    const { deps } = fakeFs()
    expect(await readExplainRecord(7, deps)).toBeNull()
  })
})

describe('readExplainRecord — hostile files', () => {
  const read = async (raw: string) => {
    const { deps } = fakeFs({ '/home/dev/.clashboard/explain/mr-7.json': raw })
    return readExplainRecord(7, deps)
  }

  it('reads unparseable JSON as absent', async () => {
    expect(await read('{not json')).toBeNull()
  })

  it('reads a record of another envelope version as absent', async () => {
    expect(await read(JSON.stringify({ ...record({ iid: 7 }), version: 99 }))).toBeNull()
  })

  it('rejects a report that does not match the block contract', async () => {
    // A hand-edited file is as untrusted as an agent reply: the renderers match
    // the union exhaustively, so an unknown block must never reach them.
    const bad = { ...record({ iid: 7 }), report: { version: 1, blocks: [{ type: 'vibes' }] } }
    expect(await read(JSON.stringify(bad))).toBeNull()
  })

  it('takes identity from the filename, not from the body', async () => {
    const lying = await read(JSON.stringify(record({ iid: 999 })))
    expect(lying?.iid).toBe(7)
  })

  it('normalises missing envelope fields rather than failing', async () => {
    const sparse = JSON.stringify({ version: EXPLAIN_RECORD_VERSION })
    expect(await read(sparse)).toEqual({
      version: 1,
      iid: 7,
      title: '',
      webUrl: '',
      sourceBranch: '',
      targetBranch: '',
      headSha: '',
      issueKey: null,
      startedAt: '',
      generatedAt: null,
      report: null,
    })
  })

  it('falls back to the start time when a report carries no generated time', async () => {
    const odd = await read(
      JSON.stringify({ ...record({ iid: 7 }), report: REPORT, generatedAt: null }),
    )
    expect(odd?.generatedAt).toBe('2026-10-01T09:00:00.000Z')
  })

  it('reads an empty issueKey as no ticket', async () => {
    const blank = await read(JSON.stringify({ ...record({ iid: 7 }), issueKey: '' }))
    expect(blank?.issueKey).toBeNull()
  })
})

describe('deleteExplainRecord', () => {
  it('removes the file', async () => {
    const { deps, files } = fakeFs()
    await writeExplainRecord(record({ iid: 7 }), deps)
    await deleteExplainRecord(7, deps)
    expect(files.size).toBe(0)
  })

  it('succeeds when there is nothing to remove', async () => {
    const { deps } = fakeFs()
    await expect(deleteExplainRecord(7, deps)).resolves.toBeUndefined()
  })
})

describe('listExplainRecords — the open tab set', () => {
  it('returns every persisted tab, oldest-started first so the strip is stable', async () => {
    const { deps } = fakeFs()
    await writeExplainRecord(record({ iid: 1, startedAt: '2026-10-01T08:00:00.000Z' }), deps)
    await writeExplainRecord(record({ iid: 2, startedAt: '2026-10-01T10:00:00.000Z' }), deps)
    await writeExplainRecord(record({ iid: 3, startedAt: '2026-10-01T09:00:00.000Z' }), deps)
    expect((await listExplainRecords(deps)).map((r) => r.iid)).toEqual([1, 3, 2])
  })

  it('includes a pending tab — this is what survives a dev-server restart', async () => {
    const { deps } = fakeFs()
    await writeExplainRecord(record({ iid: 7 }), deps)
    const tabs = await listExplainRecords(deps)
    expect(tabs).toHaveLength(1)
    expect(tabs[0]?.report).toBeNull()
  })

  it('reads a missing directory as no open tabs', async () => {
    const { deps } = fakeFs()
    expect(await listExplainRecords(deps)).toEqual([])
  })

  it('skips files that are not reports and files that no longer validate', async () => {
    const { deps } = fakeFs({
      '/home/dev/.clashboard/explain/mr-1.json': JSON.stringify(record({ iid: 1 })),
      '/home/dev/.clashboard/explain/mr-2.json': '{corrupt',
      '/home/dev/.clashboard/explain/notes.md': 'not a report',
    })
    expect((await listExplainRecords(deps)).map((r) => r.iid)).toEqual([1])
  })
})
