import { useEffect, useRef, useState } from 'react'

export const PULSE_MS = 600
export const FADE_MS = 300

export type ChangeIndicationOptions<T> = {
  id: (item: T) => string
  equals: (prev: T, next: T) => boolean
}

export type ChangeIndicationResult<T> = {
  enteringKeys: ReadonlySet<string>
  changedKeys: ReadonlySet<string>
  leaving: ReadonlyMap<string, T>
}

export function useChangeIndication<T>(
  items: readonly T[] | undefined,
  options: ChangeIndicationOptions<T>,
): ChangeIndicationResult<T> {
  const optionsRef = useRef(options)
  optionsRef.current = options

  const prevByKeyRef = useRef<Map<string, T> | null>(null)
  const leavingRef = useRef<Map<string, T>>(new Map())
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const [enteringKeys, setEnteringKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [changedKeys, setChangedKeys] = useState<ReadonlySet<string>>(() => new Set())
  const [leaving, setLeaving] = useState<ReadonlyMap<string, T>>(() => new Map())

  useEffect(() => {
    const timers = timersRef.current
    return () => {
      for (const t of timers) clearTimeout(t)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (items === undefined) return
    const { id, equals } = optionsRef.current
    const currentByKey = new Map(items.map((item) => [id(item), item]))

    if (prevByKeyRef.current === null) {
      prevByKeyRef.current = currentByKey
      return
    }

    const prev = prevByKeyRef.current
    const entering = new Set<string>()
    const changed = new Set<string>()
    const leavingNow = new Map<string, T>()
    const returning = new Set<string>()
    const currentLeaving = leavingRef.current

    for (const [key, item] of currentByKey) {
      const prevItem = prev.get(key)
      if (prevItem === undefined) {
        if (currentLeaving.has(key)) {
          returning.add(key)
        } else {
          entering.add(key)
        }
      } else if (!equals(prevItem, item)) {
        changed.add(key)
      }
    }

    for (const [key, prevItem] of prev) {
      if (!currentByKey.has(key)) {
        leavingNow.set(key, prevItem)
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
  }, [items])

  return { enteringKeys, changedKeys, leaving }
}
