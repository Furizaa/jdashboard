# 12 — Change indication animations

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

When a poll brings in changes, animate them so the user notices without disorientation.

- **Pulse** (~600ms) on cards whose displayed fields changed (status, title, labels) between the previous and current poll. Implementation: track previous state per ticket key in the board hook; mark cards `data-just-changed` for one render; CSS animation handles the rest.
- **Fade in** (~300ms) on cards that newly appear in the board results.
- **Fade out** (~300ms) on cards that are no longer in the board results, before they unmount. (Use `framer-motion` `<AnimatePresence>` or equivalent if needed; otherwise a small CSS-only solution with a delayed unmount works.)
- **No animations on initial load** — the first paint should not pulse every card.
- Animations should NOT cause other cards to jump (use absolute layout for the leaving card if needed, or accept the natural reflow if it's subtle).

## Acceptance criteria

- [ ] When a card's status/labels/title changes during a poll, the card briefly pulses (~600ms).
- [ ] When a new card appears in the board, it fades in (~300ms).
- [ ] When a card is removed from the board, it fades out (~300ms) before unmounting.
- [ ] No pulse / fade triggers on the initial paint.
- [ ] Layout shifts during fade-out are non-jarring (or eliminated entirely).
- [ ] Animations are subtle and respect `prefers-reduced-motion` (skip animation when set).

## Blocked by

- [11 — Polling + sync indicator + manual refresh](./11-polling.md)
