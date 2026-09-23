import { match } from 'ts-pattern'
import {
  useAiHandoff,
  useAskModal,
  useNoteEditor,
  useRefineModal,
  type AiModal,
} from '../presenter'
import type { NoteMode, SaveState } from '../view-model'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { NotesMarkdown } from './NotesMarkdown'
import { NotesChangelog } from './NotesChangelog'
import { NotesAiMenu } from './NotesAiMenu'
import { AskModal } from './AskModal'
import { RefineModal } from './RefineModal'

// The left pane of the widened detail panel: a private, local markdown note for
// one ticket. All logic (draft, dirty, save triggers) lives in `useNoteEditor` +
// its view-model; this file is the dumb renderer. It mirrors the right column's
// header height/padding so the two panes line up.
export function NotesPanel({
  issueKey,
  aiModal,
  onAiModalConsumed,
}: {
  issueKey: string
  /** A deep-linked AI modal to open once on arrival (the palette's `r` / `a`). */
  aiModal: AiModal | null
  onAiModalConsumed: () => void
}) {
  const editor = useNoteEditor(issueKey)
  const { display } = editor
  // On a successful refine, adopt the rewritten note straight into the editor so
  // the panel shows it without a reopen (the query also refetches, but this wins
  // the race with the editor's own save/seed cycle).
  const refine = useRefineModal(issueKey, editor.adoptContent)
  const ask = useAskModal(issueKey)
  useAiHandoff(aiModal, { refine: refine.open, ask: ask.open }, onAiModalConsumed)

  return (
    <section
      data-testid={testIds.notesPanel}
      aria-label="Notes"
      className="bg-card flex h-full min-w-0 flex-1 flex-col"
    >
      <header className="border-border bg-surface-1 flex items-center gap-3 border-b px-4 py-3">
        <span className="text-ink-subtle text-xs font-medium tracking-wide">Notes</span>
        {display.status === 'ready' && <SaveState state={display.saveState} />}
        {display.status === 'ready' && (
          <div className="ml-auto flex items-center gap-2">
            <NotesAiMenu onRefine={refine.open} onAsk={ask.open} />
            <ModeToggle mode={display.mode} onChange={editor.setMode} />
          </div>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {match(display)
          .with({ status: 'loading' }, () => (
            <p className="text-ink-tertiary p-5 text-xs">Loading note…</p>
          ))
          .with({ status: 'ready', mode: 'write' }, ({ draft }) => (
            <textarea
              data-testid={testIds.notesEditor}
              value={draft}
              onChange={(e) => editor.onChange(e.target.value)}
              onBlur={editor.onBlur}
              onKeyDown={editor.onKeyDown}
              spellCheck
              placeholder="Write markdown notes for this ticket…"
              aria-label="Note markdown"
              className="text-foreground placeholder:text-ink-tertiary h-full w-full resize-none bg-transparent p-5 font-mono text-sm leading-relaxed outline-none"
            />
          ))
          .with({ status: 'ready', mode: 'read' }, ({ draft }) => (
            <>
              {draft.trim() === '' ? (
                <p className="text-ink-tertiary p-5 text-xs">
                  Nothing to preview yet — switch to Write to start this note, or Refine from pasted
                  text.
                </p>
              ) : (
                <div className="p-5" data-testid={testIds.notesPreview}>
                  <NotesMarkdown content={draft} />
                </div>
              )}
              <NotesChangelog issueKey={issueKey} />
            </>
          ))
          .exhaustive()}
      </div>
      <RefineModal
        display={refine.display}
        issueKey={issueKey}
        onChangeText={refine.setText}
        onSubmit={refine.submit}
        onClose={refine.close}
        onChangeAnswers={refine.setAnswers}
        onSubmitAnswers={refine.submitAnswers}
      />
      <AskModal
        display={ask.display}
        issueKey={issueKey}
        onChangeQuestion={ask.setQuestion}
        onSubmit={ask.submit}
        onClose={ask.close}
        onChangeAnswers={ask.setAnswers}
        onSubmitAnswers={ask.submitAnswers}
        onAskAgain={ask.askAgain}
        // "Refine to note" hands the answer to the existing Refine flow: the user (not
        // the read-only Ask agent) chooses to fold it into the note.
        onRefineToNote={(answer) => {
          ask.close()
          refine.openWith(answer)
        }}
      />
    </section>
  )
}

function ModeToggle({ mode, onChange }: { mode: NoteMode; onChange: (mode: NoteMode) => void }) {
  return (
    <div className="border-border bg-surface-2 inline-flex items-center rounded-md border p-0.5 text-xs">
      <ModeButton
        active={mode === 'write'}
        onClick={() => onChange('write')}
        testId={testIds.notesModeWrite}
      >
        Write
      </ModeButton>
      <ModeButton
        active={mode === 'read'}
        onClick={() => onChange('read')}
        testId={testIds.notesModeRead}
      >
        Read
      </ModeButton>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean
  onClick: () => void
  testId: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        'focus-visible:ring-ring rounded px-2 py-0.5 font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
        active ? 'bg-card text-foreground shadow-sm' : 'text-ink-subtle hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  saving: 'Saving…',
}

function SaveState({ state }: { state: SaveState }) {
  return (
    <span
      data-testid={testIds.notesSaveState}
      data-state={state}
      className={cn(
        'text-[11px] leading-none',
        state === 'unsaved' ? 'text-ink-subtle' : 'text-ink-tertiary',
      )}
    >
      {SAVE_LABEL[state]}
    </span>
  )
}
