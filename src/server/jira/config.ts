export type QuickCreateConfig = {
  summaryPrefix: string
  labels: readonly string[]
  priority: string
}

export type EpicConfig = {
  statuses: readonly string[]
}

export const defaultQuickCreateConfig: QuickCreateConfig = {
  summaryPrefix: '[FE]: ',
  labels: ['Frontend'],
  priority: 'Lowest',
}

export const defaultEpicConfig: EpicConfig = {
  statuses: ['In Progress'],
}
