// Project prefix (uppercase letter, then ≥1 uppercase letter or digit), a
// hyphen, then a positive integer with no leading zeros. No whitespace,
// no lowercase, no leading zero.
const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-[1-9]\d*$/

export function quoteJqlString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

export function assertIssueKey(value: string, label: string): string {
  if (!ISSUE_KEY_PATTERN.test(value)) {
    throw new Error(`${label}: invalid issue key "${value}"`)
  }
  return value
}
