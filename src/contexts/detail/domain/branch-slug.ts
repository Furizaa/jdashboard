const MAX_TITLE_SLUG_LENGTH = 40

function slugifyTitle(title: string): string {
  const lowered = title.toLowerCase()
  const hyphenated = lowered.replaceAll(/\s+/gu, '-')
  const stripped = hyphenated.replaceAll(/[^a-z0-9-]/gu, '')
  const collapsed = stripped.replaceAll(/-+/gu, '-').replaceAll(/^-+|-+$/gu, '')
  return collapsed.slice(0, MAX_TITLE_SLUG_LENGTH).replaceAll(/-+$/gu, '')
}

export function branchSlug(input: { issueKey: string; typeName: string; title: string }): string {
  const prefix = input.typeName === 'Bug' ? 'fix' : 'feat'
  const titleSlug = slugifyTitle(input.title)
  const tail = titleSlug.length > 0 ? `${input.issueKey}-${titleSlug}` : input.issueKey
  return `${prefix}/${tail}`
}
