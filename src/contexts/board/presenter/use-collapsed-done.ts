import { useCallback, useState } from 'react'

// Per-viewer UI preference — collapsing the Done column is a client-side view
// concern, so it lives in localStorage rather than the server's ~/.clashboard.
const STORAGE_KEY = 'clashboard:board:done-collapsed'

function readInitial(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Whether the Done column is collapsed, plus a persisted toggle. */
export function useCollapsedDone(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(readInitial)
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next))
      } catch {
        // Ignore persistence failures (private mode, disabled storage).
      }
      return next
    })
  }, [])
  return [collapsed, toggle]
}
