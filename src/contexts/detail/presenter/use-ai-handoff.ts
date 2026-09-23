import { useEffect, useRef } from 'react'

/** Which AI modal a deep-link asks for. Mirrors the route's `ai` search param. */
export type AiModal = 'refine' | 'ask'

/**
 * Open the AI modal a deep-link asked for, exactly once.
 *
 * Refine and Ask cannot be hoisted out of the note editor — `useRefineModal`
 * adopts refined content straight into it, and both modals are mounted inside
 * `NotesPanel` — so the command palette hands off through the URL instead,
 * extending the mechanism `notes=true` already uses.
 *
 * The param is cleared **before** the modal opens, not when it closes: that way
 * a refresh, a back-navigation, or a sibling step cannot silently reopen a modal
 * the user has already been given. The ref latch is what makes it fire once per
 * param value rather than once per render — `open` is a fresh closure each time.
 */
export function useAiHandoff(
  ai: AiModal | null,
  handlers: { readonly refine: () => void; readonly ask: () => void },
  onConsumed: () => void,
): void {
  const handledRef = useRef<AiModal | null>(null)
  const latest = useRef({ handlers, onConsumed })
  latest.current = { handlers, onConsumed }

  useEffect(() => {
    if (ai === null) {
      handledRef.current = null
      return
    }
    if (handledRef.current === ai) return
    handledRef.current = ai
    latest.current.onConsumed()
    if (ai === 'refine') latest.current.handlers.refine()
    else latest.current.handlers.ask()
  }, [ai])
}
