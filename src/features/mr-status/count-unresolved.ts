import type { GitlabDiscussion } from '~/server/gitlab'

export function countUnresolvedThreads(
  discussions: readonly GitlabDiscussion[],
  currentUsername: string,
): number {
  let count = 0
  for (const discussion of discussions) {
    const firstNote = discussion.notes[0]
    if (firstNote === undefined) continue
    if (!firstNote.resolvable) continue
    if (firstNote.resolved) continue
    if (firstNote.author.username === currentUsername) continue
    count += 1
  }
  return count
}
