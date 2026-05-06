export type BoardJqlConfig = {
  projectKey: string
  label: string
  doneWindowDays: number
}

function quoteJqlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

export function buildBoardJql(config: BoardJqlConfig): string {
  const { projectKey, label, doneWindowDays } = config
  const quotedLabel = quoteJqlString(label)
  return [
    `project = ${projectKey}`,
    `assignee = currentUser()`,
    `labels = ${quotedLabel}`,
    `(statusCategory != Done OR status changed to Done after -${doneWindowDays}d)`,
  ].join(' AND ') + ' ORDER BY rank'
}
