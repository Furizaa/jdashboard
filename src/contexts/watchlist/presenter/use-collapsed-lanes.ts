import { useCallback, useState } from 'react'

// Per-viewer UI preference — which watchlist lanes are collapsed to a rail. A
// client-side view concern (like the main board's collapsed Done column), so it
// lives in localStorage rather than the server's ~/.clashboard. Keyed by tag id,
// so a lane keeps its collapsed state across reorders and page reloads.
const STORAGE_KEY = 'clashboard:watchlist:collapsed-lanes'

function readInitial(): ReadonlySet<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    return new Set()
  }
}

/** The set of collapsed lane tag ids, plus a persisted per-lane toggle. */
export function useCollapsedLanes(): {
  collapsed: ReadonlySet<string>
  toggle: (tagId: string) => void
} {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(readInitial)
  const toggle = useCallback((tagId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(tagId)) next.delete(tagId)
      else next.add(tagId)
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
      } catch {
        // Ignore persistence failures (private mode, disabled storage).
      }
      return next
    })
  }, [])
  return { collapsed, toggle }
}
