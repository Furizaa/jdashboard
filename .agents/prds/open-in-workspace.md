# Open in Workspace

## Problem Statement

When a developer picks up a Jira ticket in Clashboard, they have to manually: find or create the right git worktree, set up a CMUX workspace with the correct pane layout, run the project setup script, and open their tools — all before they can write a single line of code. This is a multi-step, error-prone ritual that breaks flow every time a new ticket is started.

## Solution

Add an **"Open in Workspace"** button to every ticket's detail panel. A single click creates the git worktree (if needed), configures the full CMUX workspace layout (Claude Code, editor, git TUI, diff viewer, and a setup-script pane), and focuses the workspace — dropping the developer directly into a ready-to-code environment.

The existing **"Review MR"** button moves from the panel header into a new **ACTIONS** section at the top of the properties rail, alongside the new button.

---

## User Stories

1. As a developer, I want a single button to open a ticket's workspace, so that I don't have to manually run git and terminal commands before starting work.
2. As a developer, I want the workspace button to always be visible on any ticket, so that I can start work without first navigating to a specific view.
3. As a developer, I want the ACTIONS section at the top of the properties rail, so that I can reach workspace actions without scrolling past properties.
4. As a developer, I want the "Review MR" button consolidated into ACTIONS, so that all terminal-launching actions live in one consistent place.
5. As a developer, I want a branch name modal when opening a new ticket, so that I can confirm or adjust the branch name before it's created.
6. As a developer, I want the branch name pre-filled with a meaningful slug, so that I rarely need to type anything before confirming.
7. As a developer, I want the branch prefix to default to `fix/` for Bug tickets, so that my branch naming follows project convention automatically.
8. As a developer, I want the branch prefix to default to `feat/` for all non-Bug ticket types, so that new feature branches are named correctly without manual effort.
9. As a developer, I want the worktree to be created from the latest `develop`, so that I always start from an up-to-date base.
10. As a developer, I want a git fetch to run before worktree creation, so that "latest `develop`" means the real upstream HEAD, not my potentially stale local copy.
11. As a developer, I want the worktree stored under `~/projects/worktrees/dr-web/<ticket-id>`, so that all worktrees are co-located and easy to find.
12. As a developer, I want the CMUX workspace named `GeoCloud <ticket-id>`, so that I can identify the workspace at a glance in the workspace switcher.
13. As a developer, I want the left pane to open Claude Code with the dangerous-permissions flag, so that Claude can operate without repeated prompts in a trusted worktree.
14. As a developer, I want the right pane to have three tabs — nvim, lazygit, and lumen diff — all in the worktree directory, so that my full editing toolkit is immediately available.
15. As a developer, I want `nvim .` to open the worktree root, so that my editor starts with full project context.
16. As a developer, I want a bottom pane that automatically runs the project setup script (`pnpm i && nx run-many -t i18n-compile`), so that dependencies and i18n are ready without a manual step.
17. As a developer, I want the bottom pane to stay open after setup completes, so that I have a spare CLI surface for ad-hoc commands.
18. As a developer, I want clicking "Open in Workspace" on a ticket with an existing worktree to skip the branch modal, so that I'm not prompted for information that's no longer relevant.
19. As a developer, I want clicking "Open in Workspace" when the CMUX workspace already exists to simply focus that workspace, so that the button is safe to click multiple times.
20. As a developer, I want the button to show a loading/pending state during server-side operations, so that I know the action is in progress.
21. As a developer, I want errors surfaced as toasts, so that failures are visible without leaving the board view.

---

## Implementation Decisions

### New: `ActionsRail` section in the properties rail

- A new ACTIONS `Field` is added at the top of `PropertiesRail`, above STATUS.
- Contains two action buttons: "Review MR" and "Open in Workspace".
- "Review MR" is removed from `PanelHeader` and re-rendered here.
- The "Open in Workspace" button is always shown (not gated on MR existence).

### New: Branch name modal

- A dialog component in the detail view context.
- Shown only when the worktree does not yet exist (determined by the preflight result).
- Pre-fills the branch name input with a client-side slug: `fix/<key>-<title-slug>` for Bug type, `feat/<key>-<title-slug>` for all others.
- Slug algorithm: lowercase, spaces→hyphens, strip non-alphanumeric except hyphens, truncate to ~40 chars.
- `typeName === "Bug"` is the sole trigger for the `fix/` prefix.
- User can edit the pre-filled value before confirming.

### New: `checkWorktree` server function

- Method: POST. Input: `issueKey`.
- Checks `fs.existsSync` for `~/projects/worktrees/dr-web/<issueKey>`.
- Returns `{ worktreeExists: boolean }`.
- Lives in `server/server-functions/detail.ts` alongside existing functions.

### New: `openInWorkspace` server function

- Method: POST. Input: `issueKey`, optional `branchName`.
- Step 1 (if no worktree): `git fetch origin develop` in `~/projects/dr-web`, then `git worktree add ~/projects/worktrees/dr-web/<issueKey> -b <branchName> origin/develop`.
- Step 2: Run `cmux list-workspaces` and parse for a workspace named `GeoCloud <issueKey>`.
- Step 3a (workspace found): `cmux select-workspace --workspace <ref>` → return `{ ok: true }`.
- Step 3b (no workspace): `cmux new-workspace --name "GeoCloud <issueKey>" --cwd <worktreePath> --layout <json>` → return `{ ok: true }`.
- All `cmux` and `git` calls use `spawnSync`.
- Returns `{ ok: false, error: { message } }` on any non-zero exit or thrown error.

### CMUX layout JSON (passed to `--layout`)

```
vertical split 70/30
├── horizontal split 50/50
│   ├── pane: [surface: claude --dangerously-skip-permissions]
│   └── pane: [surface: nvim ., surface: lazygit, surface: lumen diff]
└── pane: [surface: pnpm i && nx run-many -t i18n-compile]
```

All surfaces inherit the workspace `cwd` (`~/projects/worktrees/dr-web/<issueKey>`). The setup script surface is first-focused in its pane.

### Client flow

1. Click "Open in Workspace".
2. Call `checkWorktree({ issueKey })`.
3. If `worktreeExists: false` → show branch modal → on confirm, call `openInWorkspace({ issueKey, branchName })`.
4. If `worktreeExists: true` → call `openInWorkspace({ issueKey })` directly (no modal).
5. Button shows pending state during both calls; toast on error.

---

## Testing Decisions

**Good test philosophy:** Test observable behaviour at the boundary of each module — what goes in, what comes out, what side effects are triggered. Do not test internal step order or private helpers.

### What to test

**`checkWorktree` server function**

- Returns `{ worktreeExists: true }` when the worktree directory exists on disk.
- Returns `{ worktreeExists: false }` when it does not.
- Prior art: unit tests for other server functions in the detail context.

**Branch slug utility (pure function)**

- Bug type produces `fix/` prefix; all other types produce `feat/`.
- Title is lowercased, spaces become hyphens, special chars stripped, output truncated.
- Edge cases: empty title, title with only special chars, very long title.
- This is a pure function — test it directly without any React or server setup.

**`openInWorkspace` server function**

- When worktree missing: verifies `git fetch` and `git worktree add` are called with correct args.
- When CMUX workspace found by name: verifies `select-workspace` is called (not `new-workspace`).
- When CMUX workspace not found: verifies `new-workspace` is called with correct `--name`, `--cwd`, and `--layout`.
- Error cases: non-zero exit from git or cmux returns `{ ok: false }`.
- Test by injecting a fake `spawnSync` — do not actually spawn git or cmux.

### Out of scope for automated tests

- The modal component (visual, interaction-heavy).
- The ACTIONS rail layout (visual regression territory).

---

## Out of Scope

- Creating a branch from a base other than `develop`.
- Supporting repositories other than `dr-web`.
- Any CMUX workspace customisation beyond the fixed layout above.
- Tearing down or cleaning up worktrees from within Clashboard.
- Showing setup script output or progress inside the Clashboard UI.
- Handling the case where CMUX is not running.
- Any form of workspace health check or re-sync after initial creation.

---

## Further Notes

- Unlike "Review MR", which delegates entirely to a shell script at `~/.workflow/review-mr`, this feature implements all orchestration logic directly in Node. This keeps the logic visible, testable, and not dependent on a separate dotfiles script.
- The `cmux list-workspaces` output is parsed with a regex on the name column (ref + UUID + name format). Workspace identity is matched by name string, not UUID, since the name is the stable human identifier.
- All surfaces use the workspace-level `cwd` from `cmux new-workspace --cwd`; no per-surface `cwd` override is needed.
