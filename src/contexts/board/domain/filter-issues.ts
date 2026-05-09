type Filterable = { key: string; summary: string }

export function filterIssues<T extends Filterable>(
  issues: readonly T[],
  query: string,
): readonly T[] {
  const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean)
  if (terms.length === 0) return issues
  return issues.filter((issue) => {
    const haystack = `${issue.key} ${issue.summary}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}
