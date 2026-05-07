type DiscussionNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
}

type Discussion = {
  notes: readonly DiscussionNote[]
}

export function countUnresolvedThreads(
  discussions: readonly Discussion[],
  currentUsername: string,
): number {
  let count = 0
  for (const discussion of discussions) {
    const firstNote = discussion.notes[0]
    if (firstNote === undefined) continue
    if (!firstNote.resolvable) continue
    if (firstNote.resolved) continue
    if (firstNote.authorUsername === currentUsername) continue
    count += 1
  }
  return count
}
