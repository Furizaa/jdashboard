import { useRef } from 'react'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '~/design-system'
import { testIds } from '~/lib/testids'
import { useCommandPalette, type CommandPaletteDeps } from '../presenter'
import { PaletteEmpty } from './PaletteEmpty'
import { PaletteFooter } from './PaletteFooter'
import { PaletteResults } from './PaletteResults'

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
  const inputRef = useRef<HTMLInputElement>(null)

  if (display.status !== 'root') return null

  return (
    <Dialog open onOpenChange={(next) => !next && palette.close()}>
      <DialogContent
        data-testid={testIds.commandPalette}
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          inputRef.current?.focus()
        }}
        className="top-[12vh] max-h-[min(34rem,calc(100dvh-16vh))] w-[min(40rem,calc(100vw-2rem))] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-[40rem]"
      >
        <DialogTitle className="sr-only">Command palette</DialogTitle>
        <div className="border-border flex items-center gap-2.5 border-b px-4">
          <Search size={15} className="text-ink-tertiary shrink-0" aria-hidden />
          <input
            ref={inputRef}
            type="text"
            value={display.query}
            onChange={(event) => palette.setQuery(event.target.value)}
            onKeyDown={palette.onKeyDown}
            placeholder="Search tickets, MRs and commands…"
            aria-label="Search tickets, MRs and commands"
            autoComplete="off"
            spellCheck={false}
            data-testid={testIds.commandPaletteInput}
            className="text-foreground placeholder:text-ink-tertiary h-12 w-full min-w-0 bg-transparent text-sm outline-none"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-1.5">
          {display.rowCount === 0 ? (
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
        <PaletteFooter sources={display.sources} />
      </DialogContent>
    </Dialog>
  )
}
