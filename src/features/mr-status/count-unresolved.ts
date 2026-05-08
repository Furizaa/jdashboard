type DiscussionNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
  system: boolean
}

type Discussion = {
  notes: readonly DiscussionNote[]
}

export function countUnresolvedThreads(discussions: readonly Discussion[]): number {
  let count = 0
  for (const discussion of discussions) {
    const firstNote = discussion.notes[0]
    if (firstNote === undefined) continue
    if (firstNote.system) continue
    if (firstNote.resolvable && firstNote.resolved) continue
    count += 1
  }
  return count
}
