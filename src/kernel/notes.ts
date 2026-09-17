// Local notes: a single private markdown note per ticket, stored on the local
// machine as one `.md` file (see `~/server/lib/notes-store`). The wire types are
// owned by the server-function module and re-exported here so the client refers
// to them through the kernel, never `~/server/...` directly.
export type {
  GetNoteResult,
  ListNotesKeysResult,
  NoteMutationResult,
} from '~/server/server-functions/notes'
// Refine rewrites the note with a headless agent and records an automated
// changelog beside it (see `~/server/server-functions/refine`).
export type { RefineNoteResult, GetChangelogResult } from '~/server/server-functions/refine'
export type { ChangelogEntry } from '~/server/lib/notes-changelog-store'
