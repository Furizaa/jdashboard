import { columnForStatus, type BoardIssue } from '~/kernel'

export function findSiblings(
  issueKey: string,
  currentStatusName: string,
  board: ReadonlyArray<BoardIssue>,
): { prevKey: string | null; nextKey: string | null } {
  const column = columnForStatus(currentStatusName)
  const siblings = board.filter((i) => columnForStatus(i.statusName) === column)
  const idx = siblings.findIndex((i) => i.key === issueKey)
  if (idx === -1) return { prevKey: null, nextKey: null }
  return {
    prevKey: idx > 0 ? siblings[idx - 1]!.key : null,
    nextKey: idx < siblings.length - 1 ? siblings[idx + 1]!.key : null,
  }
}
