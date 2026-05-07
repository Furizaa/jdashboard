# 28 — Quick Create pinned `[FE]:` Summary prefix

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

Replace the plain Summary `<input>` from slice 26 with a frame layout that pins a non-editable `[FE]: ` prefix span inside the input. The visual: `┃[FE]: ┃<caret>▏ — what user types ┃`. The prefix is part of the input's visible frame but is outside the editable area, so the user cannot accidentally type or duplicate it.

- New component `src/features/quick-create/SummaryInput.tsx`:
  - Props: `value: string`, `onChange: (next: string) => void`, `inputRef?: Ref<HTMLInputElement>` (so the modal can still focus the input on open).
  - Layout: a flex row container styled as a single input frame — the focus ring is on the container, not the inner input. Inside the container:
    - A non-interactive `<span aria-hidden="true">` rendering `"[FE]: "` in a muted color (use the existing muted-foreground token).
    - A borderless `<input>` taking the remaining width, with `aria-label="Summary, prefixed with FE colon"`.
  - The container picks up `:focus-within` to drive the focus ring style. The inner input has its own border/outline removed.
  - `value` and `onChange` reflect only the user-typed text (not the prefix). The prefix is concatenated server-side by `buildCreatePayload` (already implemented in slice 26) — no changes to the payload contract.
- Refactor the Summary field in `src/features/quick-create/QuickCreateForm.tsx`:
  - Replace the plain `<input>` block with `<SummaryInput value={field.state.value} onChange={field.handleChange} inputRef={summaryRef} />`.
  - The `summaryRef` already used by `<QuickCreateModal>`'s `onOpenAutoFocus` continues to land on the inner input.
- No new tests — `<SummaryInput>` is a composition layer; the prefix concatenation contract is already covered by `quick-create-payload.test.ts`.

## Acceptance criteria

- [ ] The Summary field renders as a single visual input frame with `[FE]: ` pinned on the left in muted color, followed by the editable input.
- [ ] Typing in the input does not move or duplicate the prefix.
- [ ] The cursor lands inside the editable input (after the prefix span) when the modal opens.
- [ ] The container shows a focus ring when the inner input is focused.
- [ ] The submitted payload's summary is `"[FE]: <typed text>"` — no double prefix even if the user manually types `[FE]:` (still accepted, results in `"[FE]: [FE]:..."`, per the PRD's "no validation" decision).
- [ ] Screen readers announce "Summary, prefixed with FE colon" via the input's `aria-label`. The prefix span is `aria-hidden`.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- 26 (Quick Create MVP)
