# 02 — Read-only board with status mapping

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

A four-column kanban board rendering the user's tickets via the configured JQL. Cards are minimal at this slice — just key and title.

- **JQL builder** (pure module in `server/jira/`): `(config) → string`, where `config` carries `projectKey`, `label`, `doneWindowDays`. Output:
  ```
  project = <PROJECT_KEY>
    AND assignee = currentUser()
    AND labels = "<LABEL>"
    AND (statusCategory != Done OR status changed to Done after -<N>d)
  ORDER BY rank
  ```
- **Status mapping** (pure module in `features/board/`): exposes `columnForStatus(status)`, `statusesForColumn(column)`, and the canonical column ordering `[TO DO, In Implementation, In Code Review, Done]`.
- **`searchIssues` server function**: builds the JQL via the builder, calls Jira's `/search` (or `/search/jql` — verify which is current at implementation time), returns issues with a curated field list.
- **`useBoardIssues` query hook**: wraps the server function with a stable query key.
- **Board UI**: four columns with column header (label + count), cards listed within each column. Cards at this slice show only `key` and `title`. Empty columns show a small grey "No tickets" placeholder.
- Tests for JQL builder (variants for label, Done window) and status mapping (round-trip + canonical ordering).

## Acceptance criteria

- [ ] Opening the app shows four columns: TO DO, In Implementation, In Code Review, Done.
- [ ] All tickets matching the configured JQL appear in the correct column based on status mapping.
- [ ] Each column header shows the column name and a count of tickets.
- [ ] Cards display the ticket key (e.g. `HDR-1234`) and title only.
- [ ] Empty columns show "No tickets".
- [ ] Done tickets older than `JIRA_DONE_WINDOW_DAYS` are excluded.
- [ ] Epics assigned to the user appear on the board.
- [ ] Cards ordered by Jira `rank` within each column.
- [ ] JQL builder unit tests cover: default input, special-character labels (quoted), Done window of 0 and large values.
- [ ] Status mapping unit tests cover: every Jira status maps to exactly one column; `statusesForColumn` returns the expected list per column; canonical column ordering is stable.

## Blocked by

- [01 — Scaffold + auth health check](./01-scaffold.md)
