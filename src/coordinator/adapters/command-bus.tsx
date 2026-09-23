import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Commands, CommandTarget } from '../ports'

// The React adapter behind the `Commands` port. React in `coordinator/adapters/`
// is exactly what `coordinator-effects-only-in-adapters` permits, and
// `coordinator/provider.tsx` is the existing precedent.
//
// The header buttons import `useRegisterCommand` from **this module**, not from
// the `~/coordinator` barrel: that barrel re-exports hooks from `contexts/tags`
// and `contexts/watchlist`, so a button in either of those reaching for it would
// close an import cycle back onto itself. Same reason
// `use-watchlist-cards.ts` imports `~/coordinator/adapters/tanstack-cache`
// directly.

type Openers = Partial<Record<CommandTarget, () => void>>

const CommandsCtx = createContext<Commands | null>(null)

export function useCommands(): Commands {
  const commands = useContext(CommandsCtx)
  if (commands === null) throw new Error('useCommands called outside <CommandBusProvider>')
  return commands
}

export function CommandBusProvider({ children }: { children: ReactNode }) {
  const [openers, setOpeners] = useState<Openers>({})

  const register = useCallback((target: CommandTarget, open: () => void) => {
    setOpeners((prev) => ({ ...prev, [target]: open }))
    return () =>
      setOpeners((prev) => {
        const next = { ...prev }
        delete next[target]
        return next
      })
  }, [])

  const registered = useMemo(
    () => Object.keys(openers).filter((key) => openers[key as CommandTarget] !== undefined),
    [openers],
  ) as readonly CommandTarget[]

  // A target with no opener is a no-op rather than a throw: a route change can
  // always race a keypress, and the palette should not be able to crash the app
  // by offering a command a moment too long.
  const open = useCallback(
    (target: CommandTarget) => {
      openers[target]?.()
    },
    [openers],
  )

  const value = useMemo<Commands>(
    () => ({ register, registered, open }),
    [register, registered, open],
  )

  return <CommandsCtx.Provider value={value}>{children}</CommandsCtx.Provider>
}

/**
 * One line in a header button: "the palette can open me".
 *
 * The opener is held in a ref and registered behind a stable trampoline, so a
 * button whose `openModal` is a fresh closure every render does not re-register
 * on every render. The effect's cleanup is what stops the bus holding a stale
 * opener after the button unmounts — the watchlist board's `Configure lanes`
 * exists only on that route.
 */
export function useRegisterCommand(target: CommandTarget, open: () => void): void {
  const { register } = useCommands()
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => register(target, () => openRef.current()), [register, target])
}
