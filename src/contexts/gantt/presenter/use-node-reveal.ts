import { useEffect, useRef } from 'react'

/**
 * Show the lane a deep-link asked for, exactly once — the command palette's `g`
 * arriving as `/gantt?chart=<id>&node=<nodeId>`.
 *
 * This is `useAiHandoff` one surface over, and the reasoning transfers whole:
 * the param is cleared **before** the reveal runs, not after, so a refresh, a
 * back-navigation or a sibling step cannot silently re-announce a lane the
 * reader has already been shown. The ref latch makes it fire once per param
 * *value* rather than once per render, since `reveal` is a fresh closure each
 * time the collapse set changes.
 *
 * An effect rather than a guard during render — unlike `useStaleChartSync` —
 * because `onConsumed` navigates, and navigating while rendering would be
 * updating the router from inside another component's render.
 */
export function useNodeReveal(
  nodeId: string | null,
  reveal: (nodeId: string) => void,
  onConsumed: () => void,
): void {
  const handledRef = useRef<string | null>(null)
  const latest = useRef({ reveal, onConsumed })
  latest.current = { reveal, onConsumed }

  useEffect(() => {
    if (nodeId === null) {
      handledRef.current = null
      return
    }
    if (handledRef.current === nodeId) return
    handledRef.current = nodeId
    latest.current.onConsumed()
    latest.current.reveal(nodeId)
  }, [nodeId])
}
