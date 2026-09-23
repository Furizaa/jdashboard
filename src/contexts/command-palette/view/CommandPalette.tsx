import { useEffect, useRef } from 'react'
import { ChevronLeft, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { testIds } from '~/lib/testids'
import { useCommandPalette, type CommandPaletteDeps } from '../presenter'
import { PaletteActions } from './PaletteActions'
import { PaletteEmpty } from './PaletteEmpty'
import { PaletteHelp } from './PaletteHelp'
import { PaletteFooter } from './PaletteFooter'
import { PaletteResults } from './PaletteResults'
import { PaletteSubList } from './PaletteSubList'

// The ⌘K surface. All state lives in the presenter's reducer and the pure
// view-model; this file only renders `display` and forwards keystrokes.
//
// Deliberately top-aligned rather than centred like the app's other modals: a
// palette whose result list grows downward should not shift the query field as
// it does, and every tool with this gesture (Raycast, Spotlight, VS Code) puts
// it high. The card's surface, border, and radius are the shared dialog's.
export function CommandPalette(deps: CommandPaletteDeps) {
  const palette = useCommandPalette(deps)
  const { display } = palette
  const contentRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Both deep levels list an item's own things; only the root owns the query.
  const inItem = display.status === 'actions' || display.status === 'sub-list'
  // Help is a peer of the results rather than a level under an item, but it
  // shares the "no query field, back one level" shape.
  const inHelp = display.status === 'help'
  const showQuery = !inItem && !inHelp

  // The query field only exists at the root level — the action list has no text
  // filter, because typing a letter there *runs* an action. So focus moves to
  // the dialog itself when stepping in, and back to the field when stepping out.
  // Keystrokes are handled on the dialog either way, which is where they bubble.
  useEffect(() => {
    if (display.status === 'closed') return
    if (showQuery) inputRef.current?.focus()
    else contentRef.current?.focus()
  }, [display.status, showQuery])

  if (display.status === 'closed') return null

  return (
    <Dialog open onOpenChange={(next) => !next && palette.close()}>
      <DialogContent
        ref={contentRef}
        data-testid={testIds.commandPalette}
        showCloseButton={false}
        onKeyDown={palette.onKeyDown}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        className="top-[12vh] max-h-[min(34rem,calc(100dvh-16vh))] w-[min(40rem,calc(100vw-2rem))] translate-y-0 gap-0 overflow-hidden p-0 outline-none sm:max-w-[40rem]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="border-border flex h-12 items-center gap-2.5 border-b px-4">
          {!showQuery ? (
            <button
              type="button"
              onClick={palette.back}
              aria-label="Back one level"
              className="text-ink-tertiary hover:text-foreground focus-visible:ring-ring -ml-1 inline-flex size-6 shrink-0 items-center justify-center rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              <ChevronLeft size={16} />
            </button>
          ) : (
            <Search size={15} className="text-ink-tertiary shrink-0" aria-hidden />
          )}
          {display.status === 'help' ? (
            <div className="text-foreground flex min-w-0 flex-1 items-center text-sm">
              Keyboard shortcuts
            </div>
          ) : display.status === 'actions' || display.status === 'sub-list' ? (
            // At a deep level the header reads as a breadcrumb for the item
            // whose things are listed, so it is obvious what the next keypress
            // acts on — and one level deeper, which list you are in.
            <div
              data-testid={testIds.commandPaletteItemHeader}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-sm"
            >
              {display.itemBadge !== null && display.itemBadge !== '' && (
                <span className="text-ink-tertiary shrink-0 font-mono text-[11px] tabular-nums">
                  {display.itemBadge}
                </span>
              )}
              <span className="text-foreground min-w-0 truncate">{display.itemTitle}</span>
              {display.status === 'sub-list' && (
                <>
                  <span className="text-ink-tertiary shrink-0" aria-hidden>
                    ›
                  </span>
                  <span className="text-ink-subtle shrink-0">{display.title}</span>
                </>
              )}
            </div>
          ) : (
            <input
              ref={inputRef}
              type="text"
              value={display.query}
              onChange={(event) => palette.setQuery(event.target.value)}
              placeholder="Search tickets, MRs and commands…"
              aria-label="Search tickets, MRs and commands"
              autoComplete="off"
              spellCheck={false}
              data-testid={testIds.commandPaletteInput}
              className="text-foreground placeholder:text-ink-tertiary h-full w-full min-w-0 bg-transparent text-sm outline-none"
            />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {display.status === 'help' ? (
            <PaletteHelp groups={display.groups} />
          ) : display.status === 'sub-list' ? (
            <PaletteSubList
              content={display.content}
              subIndex={display.subIndex}
              emptyMessage={
                display.subList === 'status'
                  ? 'No transitions available for this ticket.'
                  : 'No tags defined.'
              }
              onHighlight={palette.highlight}
              onRun={palette.runSubItem}
            />
          ) : display.status === 'actions' ? (
            <PaletteActions
              groups={display.groups}
              actionIndex={display.actionIndex}
              onHighlight={palette.highlight}
              onRun={palette.runAction}
            />
          ) : display.rowCount === 0 ? (
            <PaletteEmpty query={display.query} sources={display.sources} />
          ) : (
            <PaletteResults
              sections={display.sections}
              selected={display.selected}
              onHighlight={palette.highlight}
              onChoose={palette.choose}
            />
          )}
        </div>
        <PaletteFooter
          level={display.status}
          sources={display.status === 'root' ? display.sources : []}
        />
      </DialogContent>
    </Dialog>
  )
}
