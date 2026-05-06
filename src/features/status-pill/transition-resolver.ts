import { columnForStatus, statusesForColumn, type Column } from '~/features/board'
import type { AllowedTransition } from '~/server/jira'

export function resolveTransition(
  currentStatus: string,
  targetColumn: Column,
  allowed: readonly AllowedTransition[],
): AllowedTransition | null {
  if (columnForStatus(currentStatus) === targetColumn) return null

  const preferenceOrder = statusesForColumn(targetColumn)
  for (const preferred of preferenceOrder) {
    const lower = preferred.toLowerCase()
    const match = allowed.find((t) => t.toStatusName.toLowerCase() === lower)
    if (match) return match
  }
  return null
}
