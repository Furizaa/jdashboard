import type { GitlabMrSummary } from './client'

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildKeyRegex(projectKey: string): RegExp {
  return new RegExp(`\\b${escapeRegex(projectKey)}-\\d+\\b`, 'g')
}

export function extractKeysFromTitle(title: string, projectKey: string): string[] {
  const matches = title.match(buildKeyRegex(projectKey)) ?? []
  return [...new Set(matches)]
}

export function buildMrKeyMap<T extends GitlabMrSummary>(
  mrs: readonly T[],
  projectKey: string,
): Record<string, T> {
  const regex = buildKeyRegex(projectKey)
  const result: Record<string, T> = {}
  for (const mr of mrs) {
    regex.lastIndex = 0
    const matches = mr.title.match(regex)
    if (matches === null) continue
    const keys = new Set(matches)
    for (const key of keys) {
      const existing = result[key]
      if (existing === undefined) {
        result[key] = mr
        continue
      }
      if (Date.parse(mr.updated_at) > Date.parse(existing.updated_at)) {
        result[key] = mr
      }
    }
  }
  return result
}
