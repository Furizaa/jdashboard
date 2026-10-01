import { useCallback } from 'react'
import { useNavigate } from '@tanstack/react-router'

/**
 * Hand one merge request off to the Explain surface.
 *
 * Detail **navigates**; it does not import `contexts/explain` (ADR-0009 §3).
 * That is what keeps the no-cross-context law intact with no coordinator
 * workflow and no `Commands` bus entry — the palette's `?ai=` hand-off one level
 * up, where the target is a whole surface rather than a modal inside a panel.
 *
 * The surface starts a run on arrival when that MR has no tab yet, so this is
 * the entire client side of "Explain this MR".
 *
 * Lives in the presenter because `useNavigate` is a router adapter and routers
 * are presenter-only (CONTEXT-MAP, "Libraries and idioms").
 */
export function useExplainHandoff(): (iid: number) => void {
  const navigate = useNavigate()
  return useCallback(
    (iid: number) => {
      navigate({ to: '/explain', search: { mr: iid } })
    },
    [navigate],
  )
}
