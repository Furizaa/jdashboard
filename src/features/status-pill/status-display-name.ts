const DISPLAY_OVERRIDES: Record<string, string> = {
  reviewed: 'Ready to Pick',
}

const ACRONYMS: ReadonlySet<string> = new Set(['STG', 'QA', 'UAT'])

function titleCaseWord(word: string): string {
  if (word.length === 0) return word
  if (ACRONYMS.has(word.toUpperCase())) return word.toUpperCase()
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function titleCase(status: string): string {
  return status.split(' ').map(titleCaseWord).join(' ')
}

export function displayNameForStatus(status: string): string {
  const override = DISPLAY_OVERRIDES[status.toLowerCase()]
  if (override !== undefined) return override
  return titleCase(status)
}
