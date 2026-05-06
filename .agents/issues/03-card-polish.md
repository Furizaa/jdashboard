# 03 — Card visual polish

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Polish the cards to match the Linear inspiration. No interactivity yet beyond hover.

- **Type icon** for each issue type (Epic, Task, Story, Bug, Improvement, Spike). Use `lucide-react` where reasonable + custom SVGs as needed. Each type has a distinct color.
- **Status pill (display-only)** rendered on the right of card row 1 — small colored dot + status name. Reflects the underlying Jira status, not the column. Visual only at this slice — clicking does nothing yet.
- **Hash-color** pure module in `features/ticket-card/`: `(label) → tailwindClass` (or color value). Deterministic — same label always yields the same color from a fixed palette of ~10 colors.
- **Label dots** on card row 3: hashed-color dot + label text. Up to 3 visible; collapse to `+N` chip beyond.
- **Hidden labels** config — a constant array (e.g. `HIDE_LABELS = ['Frontend']`) loaded from env (`JIRA_HIDE_LABELS=Frontend,...`). Hidden labels do not appear on cards.
- **2-line title clamp** with ellipsis.
- **Hover state** — subtle border lift (no full background change).
- **No assignee avatar** on cards.
- Tests for hash-color (determinism + palette spread sanity check).

## Acceptance criteria

- [ ] Each card shows: type icon, key, status pill (display-only), title (max 2 lines, ellipsis), label dots.
- [ ] Status pill color visibly differs across statuses (e.g. Reviewed vs. Blocked vs. In STG).
- [ ] Same label string always renders with the same color across cards.
- [ ] Hash-color module unit-tested for determinism (same input → same output) and palette spread (a sample of 50 distinct labels uses at least 5 distinct colors).
- [ ] Labels listed in `JIRA_HIDE_LABELS` are filtered out of card displays.
- [ ] More than 3 labels collapse to a `+N` chip.
- [ ] Cards exceeding 2 lines of title truncate with ellipsis.
- [ ] Hovering a card shows a subtle border lift; no full background swap.
- [ ] No assignee avatars rendered.

## Blocked by

- [02 — Read-only board with status mapping](./02-board-statuses.md)
