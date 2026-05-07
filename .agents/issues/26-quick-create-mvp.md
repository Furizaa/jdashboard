# 26 — Quick Create MVP (end-to-end)

**Type:** AFK

## Parent

[Quick Create PRD](../prds/quick-create.md)

## What to build

The smallest end-to-end vertical slice of Quick Create: a primary "+ New" button in the top bar opens a Radix Dialog modal with a four-field form. Submitting POSTs to Jira. Success closes the modal, shows a basic toast, and invalidates the board. Failure keeps the modal open and shows a generic error toast. This slice deliberately uses the simplest controls in each field — Type as a plain dropdown, Parent as a dropdown with only the three hardcoded entries, Summary as a plain input (no `[FE]:` UX yet), Description as a textarea. Subsequent slices polish each control, add the dynamic epic list, and add the in-flight + shortcut + toast-action layers.

- New runtime dependencies (verify latest stable at install time and pin):
  - `@radix-ui/react-dialog`
  - `@tanstack/react-form` (1.x stable; no v2 RC published at PRD time)
  - `zod` (4.x stable)
- New pure modules (server-shared) under `src/server/jira/`:
  - `quick-create-payload.ts`:
    - Public `buildCreatePayload({ form, currentUser, projectKey })` returning the `POST /rest/api/3/issue` body. Owns: the `[FE]: ` prefix concatenation, `priority: { name: "Lowest" }` (always, all three Types), `labels: ["Frontend"]`, `parent: { key }`, `assignee: { accountId }`, `project: { key }`, `issuetype: { name }`, and the description field shape (delegated to `plainTextToAdf`).
  - `plain-text-to-adf.ts`:
    - Public `plainTextToAdf(text: string): AdfNode` returning `{ type: "doc", version: 1, content: [...] }`. Splits on `\n`, maps each line to one `paragraph` node. Empty lines map to empty paragraphs.
  - `quick-create-schema.ts`:
    - Zod schema describing the validated form shape: `type: z.enum(["Bug", "Task", "Improvement"])`, `parentKey: z.string().min(1)`, `summary: z.string().min(1)`, `description: z.string().min(1)`. Exports both the schema and the inferred input type.
- New typed const under `src/features/quick-create/`:
  - `hardcoded-parents.ts`: `HARDCODED_PARENTS: ReadonlyArray<{ key: string; label: string }>` — `[{ key: "HDR-3817", label: "Tech Debt" }, { key: "HDR-10519", label: "DX" }, { key: "HDR-11712", label: "Support/Bug Umbrella" }]`.
- Extend `src/server/jira/client.ts`:
  - New method `createIssue(body: JiraCreateIssueBody): Promise<{ id: string; key: string; self: string }>` that POSTs to `/rest/api/3/issue`. Uses the existing `request<T>` helper. Add the `JiraCreateIssueBody` type for the request shape.
- New server function in `src/server/jira/server-functions.ts`:
  - `createIssue` — `createServerFn({ method: 'POST' })` with `inputValidator` parsing through `quickCreateSchema.safeParse`. Calls `buildCreatePayload` with the parsed input, the current user's `accountId` (resolved via `jiraClient.getMyself()` — same pattern as existing functions), and `env.JIRA_PROJECT_KEY`. Calls `jiraClient.createIssue`. Returns the discriminated `{ ok: true; key: string } | { ok: false; reason: 'unauthorized' | 'rejected'; message: string }`. Reuses the existing `parseJiraErrorMessage` helper.
- New client modules under `src/features/quick-create/`:
  - `use-create-issue-mutation.ts`:
    - TanStack `useMutation` wrapping the `createIssue` server function. On success: invalidates the board query (`queryClient.invalidateQueries({ queryKey: ['issues'] })` — match the key the existing `searchIssues` query uses), fires a `sonner` success toast `Created ${key}` (no actions yet — slice 31 adds those), closes the modal via the open-state setter passed in. On error: fires a generic `sonner` error toast "Failed to create ticket" — modal stays open. The mutation hook accepts the modal's `setOpen` and the form's `reset` callback as args so it can drive UI state.
  - `QuickCreateButton.tsx`:
    - Renders a primary-styled button in the header. Plus icon + "New" label. Accent background, height matched to the search input. Hosts the modal `useState`. Renders both itself and `<QuickCreateModal>` (so the dialog open/close state is colocated). No keyboard shortcut yet — slice 32 adds that.
  - `QuickCreateModal.tsx`:
    - Radix `<Dialog.Root>` controlled by the open-state prop. `<Dialog.Portal>`, `<Dialog.Overlay>` (semi-transparent), `<Dialog.Content>` centered, `<Dialog.Title>` "Quick Create". `onPointerDownOutside={e => e.preventDefault()}` to disable backdrop close. `onOpenAutoFocus={e => { e.preventDefault(); summaryRef.current?.focus(); }}` to focus the Summary input on open. Escape and X close behave default. Renders `<QuickCreateForm>` inside.
  - `QuickCreateForm.tsx`:
    - TanStack `useForm` with `validators: { onChange: quickCreateSchema }` (Standard Schema integration). Default values: `{ type: "Bug", parentKey: "", summary: "", description: "" }`. Reset on every modal open — handled via key prop in the parent or `form.reset()` in `onOpenChange`.
    - Layout (top-down): Type, Parent, Summary, Description. Each label has a trailing red asterisk. Submit row with "Create" (primary, disabled when `!form.state.canSubmit`) and "Cancel" (secondary, calls the open-state setter to close).
    - Type: plain native `<select>` with options `Bug`, `Task`, `Improvement`. Slice 27 replaces this with the segmented control.
    - Parent: a custom dropdown component listing the three `HARDCODED_PARENTS` entries. Each row shows `KEY · Label`. Click sets the form field, closes the popover. Slice 29 adds the dynamic section. (Implementation can use Radix Popover so slice 29 is a content swap, not a primitive swap.)
    - Summary: plain `<input>` bound to the form field. Slice 28 replaces with the prefixed-frame UX.
    - Description: `<textarea rows={6} className="resize-y">`.
- Wire `<QuickCreateButton />` into `src/features/header/Header.tsx` immediately to the left of the existing search input. The button matches the search input's height.
- Tests (Vitest), colocated next to each module:
  - `plain-text-to-adf.test.ts`:
    - Empty string → one empty paragraph.
    - Single line → one paragraph with one text node.
    - Multi-line input → N paragraphs, one per line.
    - Empty lines between content → empty paragraphs in the right positions.
    - The wrapping doc has `type: "doc"` and `version: 1`.
  - `quick-create-payload.test.ts`:
    - Each Type produces `priority.name === "Lowest"`.
    - The summary in the payload starts with `"[FE]: "` regardless of user input.
    - `labels` is exactly `["Frontend"]`.
    - `parent.key` passes through unchanged.
    - `project.key` comes from the input arg (not hardcoded).
    - `assignee.accountId` comes from the input arg.
    - `description` is a doc node, not a string.
  - `quick-create-schema.test.ts`:
    - A fully valid input parses successfully and produces the typed output.
    - Empty Summary fails.
    - Empty Description fails.
    - Empty parentKey fails.
    - An invalid Type ("Epic") fails.
- The Jira client method, the server function, the mutation hook, and all React components are composition layers and are not unit-tested per the PRD's testing decisions.

## Acceptance criteria

- [ ] A primary "+ New" button is visible in the top bar, immediately to the left of the search input, in an accent color, height-matched to search.
- [ ] Clicking the button opens a centered modal titled "Quick Create" with four labeled fields: Type, Parent, Summary, Description.
- [ ] Each required label carries a red asterisk.
- [ ] The Summary input has focus when the modal opens.
- [ ] Pressing Escape or clicking the X closes the modal. Clicking the modal backdrop does NOT close the modal.
- [ ] The Create button is disabled until all four required fields are non-empty.
- [ ] Submitting with valid input creates a Jira ticket with: project = `JIRA_PROJECT_KEY`, type = selected, label `Frontend`, priority `Lowest`, assignee = current user, parent = selected hardcoded entry, summary = `[FE]: <user input>`, description = ADF document of the user's plain text.
- [ ] On success the modal closes, a `Created HDR-XXXX` sonner toast appears, and the board query is invalidated (a refetch happens visibly).
- [ ] On failure the modal stays open with the user's input preserved and a generic error toast appears.
- [ ] Pure-function tests for `plainTextToAdf`, `buildCreatePayload`, and `quickCreateSchema` cover the cases listed above.
- [ ] `JIRA_API_TOKEN` does not appear in the browser bundle (the `createIssue` server function runs server-side only).
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass.

## Blocked by

None — can start immediately.
