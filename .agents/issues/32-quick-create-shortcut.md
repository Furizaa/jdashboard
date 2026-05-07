# 32 — Quick Create `c` keyboard shortcut

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

Wire a global `c` keyboard shortcut that opens the Quick Create modal from anywhere on the board, guarded against text inputs and modifier combinations. Add a small `kbd`-styled chip rendered inside the trigger button so the shortcut is discoverable.

- Refactor `src/features/quick-create/QuickCreateButton.tsx`:
  - Register a `keydown` listener on `document` via `useEffect` that opens the modal when:
    - `event.key === 'c'`
    - No modifiers pressed: `!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey`
    - The event target is not an editable element. Implementation: check `event.target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)`. Reject those targets.
    - The modal is not already open. The handler reads the open state via a ref so the listener does not re-register on every state change.
  - Cleanup the listener in the `useEffect` return.
  - The handler calls `event.preventDefault()` before opening so the `c` keystroke does not subsequently land in any input.
- Existing keyboard-shortcut utilities, if any (`src/features/keyboard/` if it exists from issue 14), should be reused rather than reimplemented.
- Update the trigger button in the same file:
  - Render a small `<kbd>` element to the right of the "New" label, styled as a muted chip with rounded corners and a light border. Content: `c`.
  - The chip is inert and `aria-hidden="true"` (the shortcut is also surfaced via the button's `title`/`aria-keyshortcuts` attribute so screen readers can announce it).
- No new tests — global keyboard listeners are UI integration, not unit-testable per the PRD.

## Acceptance criteria

- [ ] Pressing `c` while focus is on the board opens the Quick Create modal.
- [ ] Pressing `c` while focus is in the search input does NOT open the modal — the letter `c` lands in the input as text.
- [ ] Pressing `c` while focus is in the Description textarea inside the modal does NOT re-open or otherwise interfere with the modal — the letter lands in the textarea.
- [ ] Pressing `Ctrl+C`, `Cmd+C`, `Alt+C`, or `Shift+C` does NOT open the modal (modifiers disqualify the shortcut).
- [ ] Pressing `c` while the Quick Create modal is already open does nothing.
- [ ] The "+ New" button shows a small muted `c` `kbd` chip on its right side.
- [ ] The `kbd` chip is `aria-hidden`; the shortcut is announced via the button's `aria-keyshortcuts` attribute.
- [ ] The keyboard listener is cleaned up on component unmount (verified by repeated mount/unmount in dev mode without leaks).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- 26 (Quick Create MVP)
