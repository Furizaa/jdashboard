import { useCallback, useEffect, useReducer, useRef } from 'react'
import { toast } from 'sonner'
import { useNote, useSaveNote } from '~/coordinator'
import {
  deriveNoteEditor,
  initialNoteEditorState,
  reduceNoteEditor,
  type NoteEditorDisplay,
  type NoteMode,
} from '../view-model'

export type NoteEditorApi = {
  display: NoteEditorDisplay
  onChange: (content: string) => void
  onBlur: () => void
  setMode: (mode: NoteMode) => void
  // Cmd/Ctrl+S inside the textarea forces a save.
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void
  // Adopt content the note was rewritten to elsewhere (a Refine run already
  // persisted it): re-seed the draft/baseline so the panel shows it without a
  // reopen. Reuses the load path, so a non-empty rewrite reveals in read mode.
  adoptContent: (content: string) => void
}

// Thin React shell over `note-editor-view-model`. It owns three effectful jobs the
// pure view-model can't: seeding the draft from the note query, persisting on the
// save triggers (blur, switch-to-read, Cmd/Ctrl+S, unmount), and reporting a save
// failure as a toast. Everything about *what* the editor shows is the view-model's.
export function useNoteEditor(issueKey: string): NoteEditorApi {
  const [state, dispatch] = useReducer(reduceNoteEditor, initialNoteEditorState)
  const noteQuery = useNote(issueKey)
  const { save, isPending } = useSaveNote()

  const loadedContent = noteQuery.data?.content
  // Seed the local draft from the query the first time it arrives for this key,
  // and re-seed when the key changes. Adjusting state during render (guarded so it
  // can't loop) is the sanctioned way to derive editable local state from fetched
  // data without a syncing effect.
  if (loadedContent !== undefined && state.loadedKey !== issueKey) {
    dispatch({ type: 'loaded', key: issueKey, content: loadedContent })
  }

  const loaded = state.loadedKey === issueKey

  // A ref of the latest draft/baseline/key so the unmount flush (which runs from a
  // mount-only effect) never persists a stale closure's values.
  const latest = useRef({ draft: state.draft, saved: state.savedContent, key: issueKey, loaded })
  latest.current = { draft: state.draft, saved: state.savedContent, key: issueKey, loaded }

  const flush = useCallback(() => {
    const snapshot = latest.current
    if (!snapshot.loaded || snapshot.draft === snapshot.saved) return
    const content = snapshot.draft
    const key = snapshot.key
    save(key, content).then(
      (result) => {
        if (result.ok) dispatch({ type: 'saved', content })
        else toast.error(`Couldn't save note: ${result.error.message}`)
      },
      (error: unknown) => {
        toast.error(`Couldn't save note: ${error instanceof Error ? error.message : String(error)}`)
      },
    )
  }, [save])

  // Flush once when the editor unmounts (panel closed via Escape or backdrop),
  // catching an edit that never blurred. Blur covers every other exit (clicking
  // nav, the toggle, or elsewhere blurs the textarea first).
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(() => () => flushRef.current(), [])

  const setMode = useCallback(
    (mode: NoteMode) => {
      // Persist before rendering the note so read mode always shows saved content.
      if (mode === 'read') flush()
      dispatch({ type: 'setMode', mode })
    },
    [flush],
  )

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        flush()
      }
    },
    [flush],
  )

  const adoptContent = useCallback(
    (content: string) => dispatch({ type: 'loaded', key: issueKey, content }),
    [issueKey],
  )

  return {
    display: deriveNoteEditor(state, { loaded, isSaving: isPending }),
    onChange: (content) => dispatch({ type: 'edit', content }),
    onBlur: flush,
    setMode,
    onKeyDown,
    adoptContent,
  }
}
