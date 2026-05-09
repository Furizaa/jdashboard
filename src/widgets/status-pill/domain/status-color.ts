export type StatusShape =
  | 'todo'
  | 'blocked'
  | 'progress-25'
  | 'progress-50'
  | 'progress-75'
  | 'done'
  | 'review-needs'
  | 'review-rejected'
  | 'review-accepted'

export type StatusStyle = {
  shape: StatusShape
  color: string
  label: string
}

const STATUS_STYLES: Record<string, StatusStyle> = {
  reviewed: { shape: 'todo', color: '#eab308', label: '#fbbf24' },
  blocked: { shape: 'blocked', color: '#ef4444', label: '#f87171' },
  'in implementation': { shape: 'progress-25', color: '#3b82f6', label: '#60a5fa' },
  'in code review': { shape: 'progress-50', color: '#f97316', label: '#fb923c' },
  'in stg': { shape: 'progress-75', color: '#06b6d4', label: '#22d3ee' },
  'in qa': { shape: 'progress-75', color: '#8b5cf6', label: '#a78bfa' },
  'in uat': { shape: 'progress-75', color: '#ec4899', label: '#f472b6' },
  done: { shape: 'done', color: '#22c55e', label: '#4ade80' },
  'needs review': { shape: 'review-needs', color: '#22d3ee', label: '#67e8f9' },
  'review rejected': { shape: 'review-rejected', color: '#ef4444', label: '#f87171' },
  'review accepted': { shape: 'review-accepted', color: '#10b981', label: '#34d399' },
}

const FALLBACK: StatusStyle = { shape: 'todo', color: '#94a3b8', label: '#cbd5e1' }

export function styleForStatus(status: string): StatusStyle {
  return STATUS_STYLES[status.toLowerCase()] ?? FALLBACK
}
