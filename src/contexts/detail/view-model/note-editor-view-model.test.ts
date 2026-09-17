import { describe, expect, it } from 'vitest'
import {
  deriveNoteEditor,
  initialNoteEditorState,
  reduceNoteEditor,
  type NoteEditorState,
} from './note-editor-view-model'

describe('reduceNoteEditor', () => {
  it('seeds draft + baseline on load and opens an empty note in write mode', () => {
    const next = reduceNoteEditor(initialNoteEditorState, {
      type: 'loaded',
      key: 'HDR-1',
      content: '',
    })
    expect(next).toEqual({ loadedKey: 'HDR-1', mode: 'write', draft: '', savedContent: '' })
  })

  it('opens a note that already has content in read mode', () => {
    const next = reduceNoteEditor(initialNoteEditorState, {
      type: 'loaded',
      key: 'HDR-1',
      content: '# notes',
    })
    expect(next.mode).toBe('read')
    expect(next.draft).toBe('# notes')
    expect(next.savedContent).toBe('# notes')
  })

  it('re-seeds when a different ticket loads', () => {
    const first = reduceNoteEditor(initialNoteEditorState, {
      type: 'loaded',
      key: 'HDR-1',
      content: 'one',
    })
    const second = reduceNoteEditor(first, { type: 'loaded', key: 'HDR-2', content: 'two' })
    expect(second.loadedKey).toBe('HDR-2')
    expect(second.draft).toBe('two')
    expect(second.savedContent).toBe('two')
  })

  it('edit updates the draft but not the saved baseline', () => {
    const loaded = reduceNoteEditor(initialNoteEditorState, {
      type: 'loaded',
      key: 'HDR-1',
      content: 'base',
    })
    const edited = reduceNoteEditor(loaded, { type: 'edit', content: 'base + more' })
    expect(edited.draft).toBe('base + more')
    expect(edited.savedContent).toBe('base')
  })

  it('setMode switches mode without touching the draft', () => {
    const loaded = reduceNoteEditor(initialNoteEditorState, {
      type: 'loaded',
      key: 'HDR-1',
      content: '',
    })
    expect(reduceNoteEditor(loaded, { type: 'setMode', mode: 'read' }).mode).toBe('read')
  })

  it('saved advances the baseline to the persisted content', () => {
    const state: NoteEditorState = {
      loadedKey: 'HDR-1',
      mode: 'write',
      draft: 'edited',
      savedContent: 'old',
    }
    expect(reduceNoteEditor(state, { type: 'saved', content: 'edited' }).savedContent).toBe(
      'edited',
    )
  })
})

describe('deriveNoteEditor', () => {
  it('is loading until the note has loaded', () => {
    expect(deriveNoteEditor(initialNoteEditorState, { loaded: false, isSaving: false })).toEqual({
      status: 'loading',
    })
  })

  it('is saved when draft matches the baseline', () => {
    const state: NoteEditorState = {
      loadedKey: 'HDR-1',
      mode: 'read',
      draft: 'same',
      savedContent: 'same',
    }
    const display = deriveNoteEditor(state, { loaded: true, isSaving: false })
    expect(display).toMatchObject({ status: 'ready', dirty: false, saveState: 'saved' })
  })

  it('is unsaved when the draft diverges from the baseline', () => {
    const state: NoteEditorState = {
      loadedKey: 'HDR-1',
      mode: 'write',
      draft: 'new',
      savedContent: 'old',
    }
    expect(deriveNoteEditor(state, { loaded: true, isSaving: false })).toMatchObject({
      dirty: true,
      saveState: 'unsaved',
    })
  })

  it('reports saving while a write is in flight, even when dirty', () => {
    const state: NoteEditorState = {
      loadedKey: 'HDR-1',
      mode: 'write',
      draft: 'new',
      savedContent: 'old',
    }
    expect(deriveNoteEditor(state, { loaded: true, isSaving: true })).toMatchObject({
      saveState: 'saving',
    })
  })
})
