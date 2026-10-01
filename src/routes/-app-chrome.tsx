import type { ReactNode } from 'react'
import { AuthGate } from './-auth-gate'
import { CommandPaletteHost } from './-command-palette/CommandPaletteHost'
import { Header } from './-header'
import { Logo } from './-header/Logo'
import { NavRail } from './-nav/NavRail'

/**
 * Which **surface** the chrome is serving. Not the same question as which board
 * (`BoardVariant`) — and the two stopped being the same question the moment a
 * surface stopped being a board (ADR-0009 §1).
 *
 * `'explain'` is not a board: no columns, no card grid, no detail panel, no text
 * filter. So the header shows only the global tools, and every board-only
 * control falls away rather than growing a dead `explain` arm.
 */
export type ShellVariant = 'main' | 'watchlist' | 'explain'

/**
 * The four board controls the chrome passes through to the header and the
 * palette. Absent on a surface that has no board to control.
 */
export type BoardChromeControls = {
  /** The filter currently applied — `''` for none. */
  readonly filter: string
  readonly onFilterChange: (next: string) => void
  readonly onlyWorkspace: boolean
  readonly onToggleOnlyWorkspace: () => void
}

/**
 * The app chrome: the logo corner, the header, the nav rail, and the command
 * palette host. Extracted from `AppShell` when a third surface arrived that is
 * not a board — the upgrade ADR-0007 left open, taken for a surface rather than
 * for a board (ADR-0009 §1).
 *
 * Two slots, because that is what both composers need:
 *   - `children` is the surface itself, inside `<main>`.
 *   - `overlay` is rendered **above** the frame and **below** the palette.
 *     `AppShell` puts the detail panel there; ⌘K must keep working over it,
 *     which is what fixes that order.
 */
export function AppChrome({
  variant,
  board,
  overlay,
  children,
}: {
  variant: ShellVariant
  board?: BoardChromeControls
  overlay?: ReactNode
  children: ReactNode
}) {
  return (
    <AuthGate>
      <div className="flex h-dvh flex-col">
        <div className="flex h-14 shrink-0">
          {/* The logo sits in the corner where the top bar and left rail meet;
              its right/bottom borders continue the rail and header lines. */}
          <div className="bg-background border-border flex w-14 shrink-0 items-center justify-center border-r border-b">
            <Logo />
          </div>
          <div className="min-w-0 flex-1">
            <Header
              variant={variant}
              filter={board?.filter}
              onClearFilter={board === undefined ? undefined : () => board.onFilterChange('')}
              onlyWorkspace={board?.onlyWorkspace}
              onToggleOnlyWorkspace={board?.onToggleOnlyWorkspace}
            />
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <NavRail />
          <main className="min-h-0 min-w-0 flex-1">{children}</main>
        </div>
      </div>
      {overlay}
      {/* Mounted once per surface, above the overlay: ⌘K must work wherever you
          are, including with the detail panel open. */}
      <CommandPaletteHost
        variant={variant}
        filter={board?.filter}
        onFilterChange={board?.onFilterChange}
        onlyWorkspace={board?.onlyWorkspace}
        onToggleOnlyWorkspace={board?.onToggleOnlyWorkspace}
      />
    </AuthGate>
  )
}
