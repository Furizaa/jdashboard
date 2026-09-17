import { match } from 'ts-pattern'

// Framework-free state machine for the per-ticket note editor (the left pane of
// the widened detail panel). The reducer owns the local draft, the last-saved
// baseline, and the write/read mode; the derivation turns that plus "has the note
// loaded / is a save in flight" into a `DisplayState`. No React, no I/O — the
// presenter (`use-note-editor.ts`) wires the query, the save mutation, and the
// blur/toggle/Cmd-S/unmount save triggers around it.

export type NoteMode = 'write' | 'read'

export type NoteEditorState = {
  // The issue key the draft + baseline were seeded from. `null` until the note
  // has loaded once; a change of key re-seeds (see the presenter's render-time
  // `loaded` dispatch).
  readonly loadedKey: string | null
  readonly mode: NoteMode
  readonly draft: string
  // Last content known to be persisted — the baseline "dirty" is measured against.
  readonly savedContent: string
}

export const initialNoteEditorState: NoteEditorState = {
  loadedKey: null,
  mode: 'write',
  draft: '',
  savedContent: '',
}

export type NoteEditorEvent =
  | { type: 'loaded'; key: string; content: string }
  | { type: 'edit'; content: string }
  | { type: 'setMode'; mode: NoteMode }
  | { type: 'saved'; content: string }

export function reduceNoteEditor(state: NoteEditorState, event: NoteEditorEvent): NoteEditorState {
  return match(event)
    .with({ type: 'loaded' }, ({ key, content }) => ({
      loadedKey: key,
      // A note with content opens rendered (you came to read it); an empty note
      // opens in write mode ready to type. Obsidian-like default per note.
      mode: (content.trim() === '' ? 'write' : 'read') as NoteMode,
      draft: content,
      savedContent: content,
    }))
    .with({ type: 'edit' }, ({ content }) => ({ ...state, draft: content }))
    .with({ type: 'setMode' }, ({ mode }) => ({ ...state, mode }))
    .with({ type: 'saved' }, ({ content }) => ({ ...state, savedContent: content }))
    .exhaustive()
}

export type SaveState = 'saved' | 'unsaved' | 'saving'

export type NoteEditorDisplay =
  | { readonly status: 'loading' }
  | {
      readonly status: 'ready'
      readonly mode: NoteMode
      readonly draft: string
      readonly dirty: boolean
      readonly saveState: SaveState
    }

export function deriveNoteEditor(
  state: NoteEditorState,
  input: { loaded: boolean; isSaving: boolean },
): NoteEditorDisplay {
  if (!input.loaded) return { status: 'loading' }
  const dirty = state.draft !== state.savedContent
  return {
    status: 'ready',
    mode: state.mode,
    draft: state.draft,
    dirty,
    saveState: input.isSaving ? 'saving' : dirty ? 'unsaved' : 'saved',
  }
}
