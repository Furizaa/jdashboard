# 30 — Quick Create in-flight spinner, 10s timeout, locked modal

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

While the create request is in flight, replace the form contents with a centered spinner + the text "Creating your ticket…" and lock the modal: Escape, the X close button, and the Cancel button are all disabled. Add a 10-second `AbortController` timeout. On timeout, abort the request, restore the form with the user's input intact, and surface a "Request timed out — try again" sonner toast.

- Refactor `src/features/quick-create/QuickCreateModal.tsx`:
  - Read `mutation.isPending` (or an `isPending` prop) and route between two views: the form view (default) and a spinner view (`<Loader2 className="animate-spin">` from lucide + the text "Creating your ticket…", centered).
  - While pending: `<Dialog.Content onEscapeKeyDown={e => e.preventDefault()} onInteractOutside={e => e.preventDefault()}>`. The `<Dialog.Close>` (X) is hidden or rendered with `disabled` styling and `pointer-events-none`.
  - The pending state must NOT unmount the form's underlying state holder — the user's input has to survive a failed submission. Implementation: keep `<QuickCreateForm>` mounted but visually hidden behind the spinner overlay, OR keep form state in a parent ref/state object that re-mounts the form on failure with the same defaults. Whichever pattern keeps `form.state.values` recoverable on error.
- Refactor `src/features/quick-create/use-create-issue-mutation.ts`:
  - Construct an `AbortController` per `mutate()` call. Pass `controller.signal` through the server function call (TanStack Start server functions accept the AbortSignal — verify the exact API at implementation time and adapt). If the signal is not threadable into the server function, pass it to a `fetch`-level wrapper.
  - Start a 10-second `setTimeout` that calls `controller.abort()`. Clear the timeout on resolve or reject.
  - When the abort fires (`error instanceof DOMException && error.name === 'AbortError'` or equivalent), surface a sonner error toast with the message `"Request timed out — try again"` instead of the generic failure message. The modal stays open; form input is preserved.
  - The Cancel button calls the open-state setter to close the modal — but only when `!mutation.isPending`. While pending, the Cancel button is disabled.
- Refactor `src/features/quick-create/QuickCreateForm.tsx`:
  - Both Create and Cancel buttons honour `mutation.isPending`: Create is disabled while pending (in addition to the `!canSubmit` rule), Cancel is disabled while pending.
- No new tests — the spinner state and timeout behaviour are UI integration with global timers, not unit-testable per the PRD.

## Acceptance criteria

- [ ] During the create request, the modal contents are replaced by a centered spinner with the text "Creating your ticket…".
- [ ] While pending, pressing Escape does nothing.
- [ ] While pending, the X close button is disabled or non-interactive.
- [ ] While pending, the Cancel button is disabled.
- [ ] On a normal-speed successful create, the spinner appears briefly and is replaced by the closed-modal + success-toast path from slice 26.
- [ ] On a normal-speed failed create, the spinner is replaced by the form view with the user's input preserved, and the error toast appears (slice 26 behavior).
- [ ] If the create request takes longer than 10 seconds, the request is aborted client-side, the form view is restored with input preserved, and a sonner toast says "Request timed out — try again".
- [ ] After the timeout error, the modal is interactable again (Escape, X, Cancel, Create all functional).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

- 26 (Quick Create MVP)
