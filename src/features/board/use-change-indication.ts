import { useEffect, useRef, useState } from 'react'
import type { BoardIssue } from '~/server/jira'
import { columnForStatus, type Column } from './status-mapping'

export const PULSE_MS = 600
export const FADE_MS = 300

export type LeavingIssue = BoardIssue & { column: Column }

function fingerprint(issue: BoardIssue): string {
  const labels = issue.labels.toSorted().join('|')
  return `${issue.statusName}::${issue.summary}::${labels}`
}

export function useChangeIndication(issues: readonly BoardIssue[] | undefined) {
  const prevByKeyRef = useRef<Map<string, BoardIssue> | null>(null)
  const leavingRef = useRef<Map<string, LeavingIssue>>(new Map())
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const [enteringKeys, setEnteringKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [changedKeys, setChangedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [leaving, setLeaving] = useState<ReadonlyMap<string, LeavingIssue>>(() => new Map())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (issues === undefined) return
    const currentByKey = new Map(issues.map((issue) => [issue.key, issue]))

    if (prevByKeyRef.current === null) {
      prevByKeyRef.current = currentByKey
      return
    }

    const prev = prevByKeyRef.current
    const entering = new Set<string>()
    const changed = new Set<string>()
    const leavingNow = new Map<string, LeavingIssue>()
    const returning = new Set<string>()
    const currentLeaving = leavingRef.current

    for (const [key, issue] of currentByKey) {
      const prevIssue = prev.get(key)
      if (prevIssue === undefined) {
        if (currentLeaving.has(key)) {
          returning.add(key)
        } else {
          entering.add(key)
        }
      } else if (fingerprint(prevIssue) !== fingerprint(issue)) {
        changed.add(key)
      }
    }

    for (const [key, prevIssue] of prev) {
      if (!currentByKey.has(key)) {
        leavingNow.set(key, { ...prevIssue, column: columnForStatus(prevIssue.statusName) })
      }
    }

    prevByKeyRef.current = currentByKey

    if (returning.size > 0 || leavingNow.size > 0) {
      const nextLeaving = new Map(currentLeaving)
      for (const k of returning) nextLeaving.delete(k)
      for (const [k, v] of leavingNow) nextLeaving.set(k, v)
      leavingRef.current = nextLeaving
      setLeaving(nextLeaving)
    }

    if (entering.size > 0) {
      setEnteringKeys((s) => {
        const n = new Set(s)
        for (const k of entering) n.add(k)
        return n
      })
      const t = setTimeout(() => {
        timersRef.current.delete(t)
        setEnteringKeys((s) => {
          const n = new Set(s)
          for (const k of entering) n.delete(k)
          return n
        })
      }, FADE_MS)
      timersRef.current.add(t)
    }

    if (changed.size > 0) {
      setChangedKeys((s) => {
        const n = new Set(s)
        for (const k of changed) n.add(k)
        return n
      })
      const t = setTimeout(() => {
        timersRef.current.delete(t)
        setChangedKeys((s) => {
          const n = new Set(s)
          for (const k of changed) n.delete(k)
          return n
        })
      }, PULSE_MS)
      timersRef.current.add(t)
    }

    if (leavingNow.size > 0) {
      const leftKeys = leavingNow
      const t = setTimeout(() => {
        timersRef.current.delete(t)
        const nextLeaving = new Map(leavingRef.current)
        for (const k of leftKeys.keys()) nextLeaving.delete(k)
        leavingRef.current = nextLeaving
        setLeaving(nextLeaving)
      }, FADE_MS)
      timersRef.current.add(t)
    }
  }, [issues])

  return { enteringKeys, changedKeys, leaving }
}
