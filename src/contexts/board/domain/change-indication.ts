export type ChangeOptions<T> = {
  id: (item: T) => string
  equals: (prev: T, next: T) => boolean
}

export type ChangeVisual<T> = {
  enteringKeys: ReadonlySet<string>
  changedKeys: ReadonlySet<string>
  leaving: ReadonlyMap<string, T>
}

export type ChangeDiff<T> = {
  entering: ReadonlySet<string>
  changed: ReadonlySet<string>
  leavingNow: ReadonlyMap<string, T>
  returning: ReadonlySet<string>
  currentByKey: ReadonlyMap<string, T>
}

export const EMPTY_VISUAL = <T>(): ChangeVisual<T> => ({
  enteringKeys: new Set<string>(),
  changedKeys: new Set<string>(),
  leaving: new Map<string, T>(),
})

export function indexBy<T>(items: readonly T[], id: (item: T) => string): ReadonlyMap<string, T> {
  return new Map(items.map((item) => [id(item), item]))
}

export function isEmptyDiff<T>(diff: ChangeDiff<T>): boolean {
  return (
    diff.entering.size === 0 &&
    diff.changed.size === 0 &&
    diff.leavingNow.size === 0 &&
    diff.returning.size === 0
  )
}

export function diffChange<T>(
  prev: ReadonlyMap<string, T> | null,
  current: ReadonlyMap<string, T>,
  options: ChangeOptions<T>,
  leaving: ReadonlyMap<string, T>,
): ChangeDiff<T> {
  const entering = new Set<string>()
  const changed = new Set<string>()
  const returning = new Set<string>()
  const leavingNow = new Map<string, T>()

  if (prev === null) {
    return { entering, changed, leavingNow, returning, currentByKey: current }
  }

  for (const [key, item] of current) {
    const prevItem = prev.get(key)
    if (prevItem === undefined) {
      if (leaving.has(key)) {
        returning.add(key)
      } else {
        entering.add(key)
      }
    } else if (!options.equals(prevItem, item)) {
      changed.add(key)
    }
  }

  for (const [key, prevItem] of prev) {
    if (!current.has(key)) {
      leavingNow.set(key, prevItem)
    }
  }

  return { entering, changed, leavingNow, returning, currentByKey: current }
}
