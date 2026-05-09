export type CiVisualState = 'conflict' | 'failed' | 'running' | 'passed' | 'none'

export function ciVisualState({
  headPipelineStatus,
  hasConflicts,
}: {
  headPipelineStatus: string | null
  hasConflicts: boolean
}): CiVisualState {
  if (hasConflicts) return 'conflict'
  if (headPipelineStatus === 'failed' || headPipelineStatus === 'canceled') return 'failed'
  if (headPipelineStatus === 'running' || headPipelineStatus === 'pending') return 'running'
  if (headPipelineStatus === 'success') return 'passed'
  return 'none'
}
