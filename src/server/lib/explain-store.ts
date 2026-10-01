// Where an Explain tab lives: one JSON file per merge request under
// `~/.clashboard/explain/`.
//
// Plain dependency-injected functions rather than an Effect gateway, for the
// reason `notes-store.ts` states: local-machine file I/O with no external
// system, and the injected `fs` deps make it unit-testable with a fake. Upgrade
// path: swap these deps for a DB-backed store.
//
// The file is **the source of truth for which tabs are open** (ADR-0009 §2).
// Tabs in React state would lose a ten-minute agent run to a reload, and once
// closing a tab deletes the file there is nothing left for a separate open-set
// to disagree with. So the tab strip is derived from `listExplainRecords`.
//
// A record is therefore written **when the run starts**, with `report: null`,
// and rewritten when the report lands. That is what makes the two survival
// promises in ADR-0009's consequences true: a reload keeps the tab and rejoins
// the stream, and a dev-server restart — which loses the in-memory run — keeps
// the tab too, as `interrupted`, because the pending file is still there.
//
// `assertIid` guards every path, so an iid can never become a filename.

import { explainReportSchema, type ExplainReport } from './explain-report'

export type ExplainStoreDeps = {
  readonly homeDir: string
  readonly readFile: (path: string) => Promise<string>
  readonly writeFile: (path: string, data: string) => Promise<void>
  readonly mkdir: (path: string) => Promise<void>
  readonly deleteFile: (path: string) => Promise<void>
  readonly readDir: (path: string) => Promise<readonly string[]>
}

/** Bumped when the envelope around the report changes, not the report itself. */
export const EXPLAIN_RECORD_VERSION = 1

/** What the MR was when the run started — enough to label a tab with no network. */
export type ExplainTarget = {
  readonly iid: number
  readonly title: string
  readonly webUrl: string
  readonly sourceBranch: string
  readonly targetBranch: string
  /** The commit the report describes. The reason this envelope exists at all. */
  readonly headSha: string
  /** The ticket the MR belongs to, when one resolved. */
  readonly issueKey: string | null
}

/**
 * One tab, persisted. `report === null` means "started but never finished" —
 * either a run is in flight right now, or the server restarted under one.
 */
export type ExplainRecord = ExplainTarget & {
  readonly version: number
  /** ISO 8601, so a file is readable on its own. */
  readonly startedAt: string
  /** When the report landed; `null` while there is none. */
  readonly generatedAt: string | null
  readonly report: ExplainReport | null
}

const FILE_PREFIX = 'mr-'
const FILE_EXT = '.json'

function assertIid(iid: number, label: string): number {
  if (!Number.isInteger(iid) || iid <= 0) {
    throw new Error(`${label} (iid): must be a positive integer`)
  }
  return iid
}

export function explainDir(homeDir: string): string {
  return `${homeDir}/.clashboard/explain`
}

export function explainFilePath(homeDir: string, iid: number): string {
  return `${explainDir(homeDir)}/${FILE_PREFIX}${assertIid(iid, 'explainFilePath')}${FILE_EXT}`
}

/** `mr-4211.json` → `4211`, and `null` for anything else in the directory. */
export function iidFromFileName(name: string): number | null {
  if (!name.startsWith(FILE_PREFIX) || !name.endsWith(FILE_EXT)) return null
  const digits = name.slice(FILE_PREFIX.length, -FILE_EXT.length)
  if (!/^[1-9]\d*$/u.test(digits)) return null
  return Number(digits)
}

/**
 * A missing file reads as absent, not as an error — the common case is "no tab
 * for this MR yet", which is how Explain starts. A file that is present but
 * unreadable or invalid also reads as absent: a corrupt record is
 * indistinguishable from none for every purpose the app has, and crashing the
 * tab strip over one bad file would be worse.
 */
export async function readExplainRecord(
  iid: number,
  deps: ExplainStoreDeps,
): Promise<ExplainRecord | null> {
  let raw: string
  try {
    raw = await deps.readFile(explainFilePath(deps.homeDir, iid))
  } catch {
    return null
  }
  return decodeRecord(raw, iid)
}

export async function writeExplainRecord(
  record: ExplainRecord,
  deps: ExplainStoreDeps,
): Promise<void> {
  const path = explainFilePath(deps.homeDir, record.iid)
  await deps.mkdir(explainDir(deps.homeDir))
  await deps.writeFile(path, `${JSON.stringify(record, null, 2)}\n`)
}

/** A missing file is success: closing a tab whose run never finished must work. */
export async function deleteExplainRecord(iid: number, deps: ExplainStoreDeps): Promise<void> {
  try {
    await deps.deleteFile(explainFilePath(deps.homeDir, iid))
  } catch {
    // nothing to remove — already gone
  }
}

/**
 * Every persisted tab, oldest-started first so the strip's left-to-right order
 * is stable as reports land. A missing directory (nothing explained yet) reads
 * as the empty list rather than throwing, mirroring `listNoteKeys`.
 */
export async function listExplainRecords(deps: ExplainStoreDeps): Promise<ExplainRecord[]> {
  let entries: readonly string[]
  try {
    entries = await deps.readDir(explainDir(deps.homeDir))
  } catch {
    return []
  }
  const iids = entries
    .map(iidFromFileName)
    .filter((iid): iid is number => iid !== null)
    .toSorted((a, b) => a - b)
  const records: ExplainRecord[] = []
  for (const iid of iids) {
    // Sequential on purpose: this is a handful of small local files, and a
    // bounded pool would be more machinery than the read is worth.
    // oxlint-disable-next-line no-await-in-loop -- see comment above
    const record = await readExplainRecord(iid, deps)
    if (record !== null) records.push(record)
  }
  return records.toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

/**
 * Validate on the way **in** as well as on the way out of the agent: a file on
 * disk is as much an untrusted input as an agent reply, and the renderers match
 * the block union exhaustively, so a hand-edited file must not reach them.
 */
function decodeRecord(raw: string, iid: number): ExplainRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
  const record = parsed as Record<string, unknown>
  if (record.version !== EXPLAIN_RECORD_VERSION) return null

  // A pending record legitimately carries no report. A record that carries one
  // which no longer validates is corrupt, not pending — failing it is right.
  let report: ExplainReport | null = null
  if (record.report !== null && record.report !== undefined) {
    const parsedReport = explainReportSchema.safeParse(record.report)
    if (!parsedReport.success) return null
    report = parsedReport.data
  }

  const generatedAt = typeof record.generatedAt === 'string' ? record.generatedAt : null
  return {
    version: EXPLAIN_RECORD_VERSION,
    // The filename is the identity, not the body: a mismatched `iid` inside
    // cannot move a tab's report onto another MR.
    iid,
    title: str(record.title),
    webUrl: str(record.webUrl),
    sourceBranch: str(record.sourceBranch),
    targetBranch: str(record.targetBranch),
    headSha: str(record.headSha),
    issueKey:
      typeof record.issueKey === 'string' && record.issueKey !== '' ? record.issueKey : null,
    startedAt: str(record.startedAt),
    // A report with no timestamp would render as "generated never"; the started
    // time is the honest fallback.
    generatedAt: report === null ? null : (generatedAt ?? str(record.startedAt)),
    report,
  }
}
