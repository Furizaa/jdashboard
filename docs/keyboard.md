# Keyboard

clashboard is built to be driven from the keyboard. ⌘K opens the [command palette](../src/contexts/command-palette/CONTEXT.md), which is the primary way to find work and act on it.

> **Source of truth: [`src/kernel/commands.ts`](../src/kernel/commands.ts).**
>
> The per-action letters below are a **copy** of `ACTION_SHORTCUTS`. A duplicate letter in that map throws at module load, and `src/kernel/commands.test.ts` asserts the map matches the PRD, but nothing can check this page. If the two disagree, the map is right — fix the map first, then this table.
>
> The palette's own help view (`?` from the root level) _is_ generated from the map, so it can never drift. Prefer it when you just want to look something up; this page exists for readers who are not running the app.

## Getting around

| Key                 | Where                  | What it does                                      |
| ------------------- | ---------------------- | ------------------------------------------------- |
| `⌘K` / `Ctrl-K`     | anywhere               | Toggle the palette (never while typing elsewhere) |
| `Esc`               | palette, any depth     | Close the whole palette                           |
| `↑` / `↓`           | palette                | Move the highlight (wraps at both ends)           |
| `j` / `k`           | palette, below root    | Move the highlight                                |
| `↵`                 | results                | Open the highlighted item's action list           |
| `←` / `Backspace`   | palette, below root    | Pop exactly one level                             |
| `?`                 | palette root, no query | The generated shortcut reference                  |
| `1`–`9`             | a nested list          | Pick that row                                     |
| `c`                 | board                  | New ticket (quick-create's own shortcut)          |
| `j` / `k`, `o`, `c` | detail panel           | Sibling navigation, open in Jira, copy link       |

`j` / `k` move the highlight only below the palette's root level. The root owns the query field, so a letter there types — a palette you cannot type "kod" into is not a search box. For the same reason board-level commands are `Enter`-only rather than keyed.

## Per-item actions

Pressing a letter in an item's action list runs that action. Only the actions **legal for that item** are listed, and a letter bound to an illegal action is a no-op — it neither falls through to another handler nor closes the palette.

| Key       | Action                         | Legal when                              |
| --------- | ------------------------------ | --------------------------------------- |
| `↵` / `d` | Open detail                    | there is a ticket behind the item       |
| `s`       | Change Status… _(nested)_      | the ticket has transitions              |
| `n`       | Open Notes                     | there is a ticket                       |
| `t`       | Tags… _(nested)_               | there is a ticket and ≥1 tag is defined |
| `w`       | Add to / Remove from Watchlist | there is a ticket (label flips)         |
| `r`       | AI Refine                      | there is a ticket                       |
| `a`       | AI Ask                         | there is a ticket                       |
| `o`       | Open in Jira                   | the board has loaded a base URL         |
| `c`       | Copy Jira Link                 | the board has loaded a base URL         |
| `y`       | Copy Issue Key                 | there is a ticket                       |
| `m`       | Open MR in GitLab              | an MR resolves for the item             |
| `v`       | Review MR                      | an MR resolves for the item             |
| `e`       | Open in Workspace              | no workspace is open for the ticket     |
| `f`       | Focus Workspace                | a workspace is open for the ticket      |
| `x`       | Discard Workspace              | a workspace is open for the ticket      |

"There is a ticket behind the item" is `workItemJiraKey(item) !== null`. A **fake review card** — an MR whose title carries no resolvable Jira key — has none, so it is offered exactly `m` and `v`. That falls out of the rule rather than being a special case: see [`action-legality.ts`](../src/routes/-command-palette/action-legality.ts).

`e` opens the detail panel's real branch-name prompt, and `x` its real confirmation. Neither is a shortcut past the dialog: the prompt carries the worktree-already-exists warning and reuses an existing MR branch, and discarding force-removes a worktree.

## Why these letters

- **A curated static map, not positional digits.** Each action kind owns a fixed letter, so the same key always means the same thing regardless of which actions happen to be legal in front of you. Positional digits would move an action's key as legality changed, which is the opposite of muscle memory. Digits _are_ used inside a nested list, where the list is short, dynamic, and homogeneous — there is nothing stable to memorise there anyway.
- **No ⌘-modified shortcuts.** ⌘T, ⌘N, and ⌘W belong to the browser and cannot be reliably intercepted in a web app.
- **`j` / `k` are reserved for list navigation everywhere**, matching the detail panel's existing bindings, and `o` / `c` keep the meanings [`panel-key-intent.ts`](../src/contexts/detail/domain/panel-key-intent.ts) already gives them.

Recorded in [ADR-0008](adr/0008-command-palette-action-catalogue.md).
