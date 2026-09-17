import { assertIssueKey } from './jql'

// Persistent store for local tags: user-defined coloured labels the user attaches
// to tickets, kept in a small JSON file alongside the watchlist. Like
// `watchlist-store.ts` these are plain, dependency-injected functions rather than
// an Effect gateway — it is local-machine file I/O with no external system, and
// the injected `fs` deps make it unit-testable with a fake. Upgrade path: swap
// these deps for a DB-backed store.
//
// Two concerns live in one file: `definitions` (the palette the user curates) and
// `attachments` (which tag ids are pinned to which Jira issue key). Deleting a
// definition cascades into `attachments` so no attachment ever dangles.

export type TagDefinition = {
  readonly id: string
  readonly name: string
  readonly colorId: string
}

export type TagsState = {
  readonly definitions: readonly TagDefinition[]
  readonly attachments: Readonly<Record<string, readonly string[]>>
}

export type TagsStoreDeps = {
  homeDir: string
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, data: string) => Promise<void>
  mkdir: (path: string) => Promise<void>
}

const EMPTY_STATE: TagsState = { definitions: [], attachments: {} }

const MAX_NAME_LENGTH = 40

export function tagsDir(homeDir: string): string {
  return `${homeDir}/.clashboard`
}

export function tagsFilePath(homeDir: string): string {
  return `${tagsDir(homeDir)}/tags.json`
}

// A trimmed, length-bounded, non-empty display name. Throws on invalid input so
// writes never persist a blank or absurdly long tag name.
export function assertTagName(name: unknown, label: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (trimmed.length === 0) throw new Error(`${label}: tag name must not be empty`)
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(`${label}: tag name must be at most ${MAX_NAME_LENGTH} characters`)
  }
  return trimmed
}

function assertColorId(colorId: unknown, label: string): string {
  // The colour palette lives client-side (kernel); the store treats the id as an
  // opaque non-empty token and trusts the client to send a palette member.
  const value = typeof colorId === 'string' ? colorId.trim() : ''
  if (value.length === 0) throw new Error(`${label}: tag colour must not be empty`)
  return value
}

function normalizeDefinition(raw: unknown): TagDefinition | null {
  if (typeof raw !== 'object' || raw === null) return null
  const { id, name, colorId } = raw as { id?: unknown; name?: unknown; colorId?: unknown }
  if (typeof id !== 'string' || typeof name !== 'string' || typeof colorId !== 'string') return null
  if (id.length === 0 || name.length === 0 || colorId.length === 0) return null
  return { id, name, colorId }
}

function normalizeAttachments(
  raw: unknown,
  knownIds: ReadonlySet<string>,
): Record<string, readonly string[]> {
  if (typeof raw !== 'object' || raw === null) return {}
  const result: Record<string, readonly string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue
    const ids = [
      ...new Set(value.filter((v): v is string => typeof v === 'string' && knownIds.has(v))),
    ]
    if (ids.length > 0) result[key] = ids
  }
  return result
}

// Robust against a missing file (never written yet) and hand-edits that leave
// malformed JSON — either case reads as the empty state rather than throwing.
// Attachment ids referencing a since-removed definition are dropped on read.
export async function readTagsState(deps: TagsStoreDeps): Promise<TagsState> {
  let raw: string
  try {
    raw = await deps.readFile(tagsFilePath(deps.homeDir))
  } catch {
    return EMPTY_STATE
  }
  try {
    const parsed = JSON.parse(raw) as { definitions?: unknown; attachments?: unknown }
    const definitionList = Array.isArray(parsed?.definitions) ? parsed.definitions : []
    const definitions: TagDefinition[] = []
    const seen = new Set<string>()
    for (const entry of definitionList) {
      const def = normalizeDefinition(entry)
      if (def === null || seen.has(def.id)) continue
      seen.add(def.id)
      definitions.push(def)
    }
    return { definitions, attachments: normalizeAttachments(parsed?.attachments, seen) }
  } catch {
    return EMPTY_STATE
  }
}

async function writeState(state: TagsState, deps: TagsStoreDeps): Promise<void> {
  await deps.mkdir(tagsDir(deps.homeDir))
  await deps.writeFile(tagsFilePath(deps.homeDir), `${JSON.stringify(state, null, 2)}\n`)
}

export async function createTagDefinition(
  def: { id: string; name: string; colorId: string },
  deps: TagsStoreDeps,
): Promise<TagsState> {
  const name = assertTagName(def.name, 'createTagDefinition')
  const colorId = assertColorId(def.colorId, 'createTagDefinition')
  if (typeof def.id !== 'string' || def.id.length === 0) {
    throw new Error('createTagDefinition: tag id must not be empty')
  }
  const current = await readTagsState(deps)
  if (current.definitions.some((d) => d.id === def.id)) return current
  const next: TagsState = {
    ...current,
    definitions: [...current.definitions, { id: def.id, name, colorId }],
  }
  await writeState(next, deps)
  return next
}

export async function updateTagDefinition(
  id: string,
  patch: { name?: string; colorId?: string },
  deps: TagsStoreDeps,
): Promise<TagsState> {
  const current = await readTagsState(deps)
  if (!current.definitions.some((d) => d.id === id)) return current
  const name =
    patch.name === undefined ? undefined : assertTagName(patch.name, 'updateTagDefinition')
  const colorId =
    patch.colorId === undefined ? undefined : assertColorId(patch.colorId, 'updateTagDefinition')
  const next: TagsState = {
    ...current,
    definitions: current.definitions.map((d) =>
      d.id === id ? { id: d.id, name: name ?? d.name, colorId: colorId ?? d.colorId } : d,
    ),
  }
  await writeState(next, deps)
  return next
}

// Removing a definition cascades: the id is stripped from every ticket's
// attachment list and now-empty lists are dropped.
export async function deleteTagDefinition(id: string, deps: TagsStoreDeps): Promise<TagsState> {
  const current = await readTagsState(deps)
  if (!current.definitions.some((d) => d.id === id)) return current
  const attachments: Record<string, readonly string[]> = {}
  for (const [key, ids] of Object.entries(current.attachments)) {
    const kept = ids.filter((tagId) => tagId !== id)
    if (kept.length > 0) attachments[key] = kept
  }
  const next: TagsState = {
    definitions: current.definitions.filter((d) => d.id !== id),
    attachments,
  }
  await writeState(next, deps)
  return next
}

export async function attachTag(
  issueKey: string,
  tagId: string,
  deps: TagsStoreDeps,
): Promise<TagsState> {
  const key = assertIssueKey(issueKey, 'attachTag')
  const current = await readTagsState(deps)
  if (!current.definitions.some((d) => d.id === tagId)) {
    throw new Error(`attachTag: unknown tag id ${tagId}`)
  }
  const existing = current.attachments[key] ?? []
  if (existing.includes(tagId)) return current
  const next: TagsState = {
    ...current,
    attachments: { ...current.attachments, [key]: [...existing, tagId] },
  }
  await writeState(next, deps)
  return next
}

export async function detachTag(
  issueKey: string,
  tagId: string,
  deps: TagsStoreDeps,
): Promise<TagsState> {
  const key = assertIssueKey(issueKey, 'detachTag')
  const current = await readTagsState(deps)
  const existing = current.attachments[key] ?? []
  if (!existing.includes(tagId)) return current
  const kept = existing.filter((id) => id !== tagId)
  const attachments = { ...current.attachments }
  if (kept.length > 0) attachments[key] = kept
  else delete attachments[key]
  const next: TagsState = { ...current, attachments }
  await writeState(next, deps)
  return next
}
