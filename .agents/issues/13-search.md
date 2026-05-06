# 13 — Search filter

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

A header search input that filters the board client-side by ticket key or title.

- **Search input** in the header (~240px wide), styled to match the rest of the header.
- **`Cmd/Ctrl+K`** focuses the input. Bound globally; ignores when other text inputs are already focused.
- **Esc** clears the input and unfocuses.
- **Filter pure module** in `features/board/`: `(issues, query) → issues`. Matches against `key` and `title`, case-insensitive. Empty query returns the original list unchanged. Whitespace trimmed; multi-word queries split on whitespace and require all terms to match (AND).
- **Filter applied client-side** in the board component — no server requests. The filtered list is what the columns render.
- Tests for the filter module: exact key match, partial title match, case insensitivity, empty query, multi-word, leading/trailing whitespace.

## Acceptance criteria

- [ ] Search input visible in the header.
- [ ] `Cmd/Ctrl+K` focuses the input from anywhere in the app.
- [ ] Typing filters cards across all four columns by key or title (case-insensitive).
- [ ] Empty query shows all cards.
- [ ] Esc clears the search and unfocuses the input.
- [ ] Multi-word queries match cards containing all the words (AND semantics).
- [ ] Filter module unit-tested for exact key match, partial title, case insensitivity, multi-word, whitespace handling.
- [ ] Filtering does not trigger any server requests.

## Blocked by

- [02 — Read-only board with status mapping](./02-board-statuses.md)
