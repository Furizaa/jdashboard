type DiscussionNote = {
  authorUsername: string
  resolvable: boolean
  resolved: boolean
  system: boolean
}

type Discussion = {
  notes: readonly DiscussionNote[]
}

// "Unresolved" here matches GitLab's own definition: only resolvable threads
// that haven't been resolved count. Non-resolvable discussions (bot status
// comments, plain MR comments, system events) are not threads-to-resolve and
// must not inflate the count — otherwise approved MRs with a Coverage-bot
// note render as "Approved (unresolved)" forever.
export function countUnresolvedThreads(discussions: readonly Discussion[]): number {
  let count = 0
  for (const discussion of discussions) {
    const firstNote = discussion.notes[0]
    if (firstNote === undefined) continue
    if (firstNote.system) continue
    if (!firstNote.resolvable) continue
    if (firstNote.resolved) continue
    count += 1
  }
  return count
}
