export { IssueDetailPanel } from './view'
// Exposed for the command palette's host in `routes/-command-palette/`: the
// palette's workspace actions drive the *same* flow and the *same* two dialogs
// the panel's buttons do, rather than a second copy (ADR-0008).
export { useWorkspaceActions, type WorkspaceActionsApi, type WorkspaceTarget } from './presenter'
export { WorkspaceActionModals } from './view/WorkspaceActionModals'
