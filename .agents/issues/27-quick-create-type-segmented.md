# 27 — Quick Create Type segmented control

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

Replace the native `<select>` Type field from slice 26 with a three-pill segmented control that reuses the existing `TypeIcon` colors and icons. Bug, Task, and Improvement become visually continuous with the cards on the board — same icon, same accent color when selected.

- New component `src/features/quick-create/TypeSegmented.tsx`:
  - Props: `value: 'Bug' | 'Task' | 'Improvement'`, `onChange: (next: ...) => void`.
  - Renders a single row of three buttons. Each button shows the lucide icon + label for its type, picking colors from the same `TYPE_STYLES` record used by `src/features/ticket-card/TypeIcon.tsx` (Bug = red Bug, Task = blue CheckSquare, Improvement = cyan TrendingUp).
  - The selected segment is filled with its accent color (or has an accent border + accent text); unselected segments are subdued — exact color choices match the dark-theme tokens already in use elsewhere on the board.
  - The control is keyboard-navigable: arrow keys move selection within the group, Enter/Space activates. `role="radiogroup"` on the container, `role="radio"` + `aria-checked` on each button. The visible label and the icon are both inside the button; the icon has `aria-hidden`.
- Refactor the Type field in `src/features/quick-create/QuickCreateForm.tsx`:
  - Replace the native `<select>` block with `<TypeSegmented value={field.state.value} onChange={field.handleChange} />`.
  - Default value (`"Bug"`) is unchanged; reset-on-modal-open behaviour is unchanged.
- Optional: extend `src/features/ticket-card/TypeIcon.tsx` (or extract a shared module) so `TYPE_STYLES` is importable by `TypeSegmented` without duplicating the color/icon table. If extraction is needed, it lives at `src/features/ticket-card/type-styles.ts` and both `TypeIcon` and `TypeSegmented` import from it.
- No new tests — `<TypeSegmented>` is a composition layer; the underlying Type validation is already covered by `quick-create-schema.test.ts`.

## Acceptance criteria

- [ ] The Type field in the Quick Create modal is rendered as three side-by-side pill buttons (Bug, Task, Improvement) instead of a dropdown.
- [ ] Each pill shows the same icon and accent color as the existing card type icon for that type.
- [ ] The selected pill is visually distinct (accent fill or border) from the unselected pills.
- [ ] Clicking a pill changes the selected Type. The Type defaults to Bug on every modal open.
- [ ] Arrow-key navigation moves selection within the group; Enter/Space confirms.
- [ ] `role="radiogroup"` is on the container and `aria-checked` reflects the selected pill.
- [ ] No regression in form submission — submitting the form still produces the correct `issuetype.name` for each pill.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- 26 (Quick Create MVP)
