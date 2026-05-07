export function buildEpicJql(projectKey: string): string {
  return `issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = "${projectKey}"`
}
