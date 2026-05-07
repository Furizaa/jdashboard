# clashboard — Quick Create ticket modal in the top bar

## Problem Statement

Today, every time I want to log a new bug or task that I notice while doing other work, I leave clashboard, switch to Jira, click through to the project, click "Create", wait for the create dialog to load, and then fill in fields whose values are *always the same for me*: project = HDR, label = Frontend, status = New, priority = Lowest, assignee = me, summary prefixed with `[FE]:`, parent = one of three umbrella tickets or whichever epic I'm currently working in. The cost of that round-trip is high enough that I either skip logging the ticket (and forget it) or I batch them up at the end of the day (by which point I've forgotten the details). Either way, the friction of Jira's full-blown create dialog is acting as a tax on capturing work-in-the-wild.

A second related symptom: even when I do open Jira's create dialog, I have to re-make the same field-by-field decisions every time, and a slip of attention can put a bug in the wrong project, with the wrong type, the wrong assignee, or no parent at all. The default-laden form in Jira does not match how I, specifically, create tickets — and the cost of fixing one of those slips after the fact is higher than the cost of preventing it up front.

## Solution

Add a single primary "+ New" button in the top bar that opens a Radix-based modal containing a four-field form: Type (Bug/Task/Improvement segmented buttons), Parent (pinned umbrella tickets + my in-progress epics), Summary (with a baked-in `[FE]: ` prefix), Description (plain-text textarea). All other fields — project, label, priority, status, assignee — are set automatically and not visible. Submitting POSTs `/rest/api/3/issue` server-side and, on success, closes the modal, fires a toast with `[Open]` and `[View in Jira]` actions, and invalidates the board query so a matching ticket appears as a card. On failure, the modal stays open with the user's input intact and a detailed Jira error surfaces in a toast. The `c` keyboard shortcut opens the modal from anywhere on the board.

The shape of the form matches the way I actually create tickets — three free decisions (Type, Parent, what to write) — instead of asking me to re-make every other decision every time. The hidden defaults are not "lazy" defaults; they are the *correct* defaults for the workflow this dashboard is built for.

## User Stories

1. As a developer, I want a primary "+ New" button in the top bar, so that creating a ticket is one click from anywhere on the board.
2. As a developer, I want the "+ New" button to sit immediately to the left of the search input, so that it sits with the other top-bar actions and is the first thing my eyes land on after the logo.
3. As a developer, I want the "+ New" button to be the same height as the search input and rendered in an emphasized accent color, so that it reads as the most-promoted action in the bar.
4. As a developer, I want a `c` keyboard shortcut that opens the Quick Create modal, so that I can capture a ticket without taking my hands off the keyboard.
5. As a developer, I want the `c` shortcut to be ignored when focus is in a text input, textarea, or another open modal, so that typing the letter `c` in the search box or in another field never accidentally opens Quick Create.
6. As a developer, I want a small `c` keyboard hint chip rendered inside the "+ New" button, so that the shortcut is discoverable without needing a separate help screen.
7. As a developer, I want the Quick Create form to live in a centered modal dialog, so that it is unambiguously a focused subtask separate from the board behind it.
8. As a developer, I want the modal to close on `Escape` and on the `X` button in its header, so that exiting is fast and obvious.
9. As a developer, I want clicking the modal backdrop to do nothing, so that an accidental misclick outside the dialog never throws away a draft I am writing.
10. As a developer, I want the modal to focus the Summary input when it opens, so that I can start typing the most important field immediately.
11. As a developer, I want the form to consist of exactly four visible fields — Type, Parent, Summary, Description, in that top-down order — so that the form stays compact and scannable.
12. As a developer, I want Type to be a segmented row of three buttons (Bug, Task, Improvement), so that I can see all options at once and switch with a single click.
13. As a developer, I want each Type segment to use the same icon and accent color as the existing card type icons (Bug = red Bug, Task = blue CheckSquare, Improvement = cyan TrendingUp), so that the segmented control reads as continuous with the rest of the board's visual language.
14. As a developer, I want Bug to be the default Type every time the modal opens, so that the most common case requires zero clicks.
15. As a developer, I want the Type selection to reset to Bug on every modal open, so that a stray previous choice never carries over and silently mislabels a new ticket.
16. As a developer, I want a Parent dropdown that I have to actively pick a value from (no default), so that I never accidentally submit a ticket with the wrong parent because I forgot to change it.
17. As a developer, I want the Parent dropdown to render two sections — "Pinned" first, then "My in-progress epics" — separated by a thin divider, so that the structure of the list is self-documenting.
18. As a developer, I want the Pinned section to contain three hardcoded entries (HDR-3817 Tech Debt, HDR-10519 DX, HDR-11712 Support/Bug Umbrella), so that the most-used parents are always one click away regardless of what is on my plate.
19. As a developer, I want the "My in-progress epics" section to list epics where I am the assignee and the status is exactly "In Progress" within the configured project, so that the dynamic options are scoped to work I am actually pushing forward right now.
20. As a developer, I want each Parent option to render as `KEY · Summary`, with the key in muted monospace and the summary in foreground color, so that I can pick by either key or topic and the alignment stays clean.
21. As a developer, I want the in-progress epic list to be fetched lazily when the modal opens (not on app boot), so that the boot path is not slowed down by a query that most of the time will not be used.
22. As a developer, I want the Pinned entries to render immediately on modal open while the dynamic epics load underneath, so that I can pick a hardcoded parent before the network roundtrip even completes.
23. As a developer, I want a skeleton row in the dynamic section while epics are loading, so that the dropdown does not visually jump when results arrive.
24. As a developer, I want a muted "No active epics assigned to you" line in the dynamic section when the query returns zero results, so that I know the system tried and there was nothing — as opposed to "did this break?".
25. As a developer, I want the dropdown to remain usable with only the three Pinned entries when the epic query fails, with a quiet inline retry link in the dynamic section, so that an epic-list outage never blocks me from filing a ticket.
26. As a developer, I want the Summary input to display a non-editable `[FE]: ` prefix span pinned inside the input frame to the left of my cursor, so that the prefix is unmistakably visible and I cannot accidentally type it again myself.
27. As a developer, I want the prefix to be `aria-hidden` and the input's `aria-label` to read "Summary, prefixed with FE colon", so that screen readers get correct context without a duplicate prefix being spoken.
28. As a developer, I want the Description input to be a multi-line textarea sized to roughly six rows by default, with vertical resize enabled, so that short bug reports are not cramped and long repro steps can be expanded as needed.
29. As a developer, I want the Description to accept plain text and convert it to ADF on submit by mapping each line to one paragraph (preserving empty lines), so that what I see in the textarea is what gets rendered in Jira.
30. As a developer, I want the form to never load a Jira description template, so that the Description field is always empty on open and stays a fast-capture textarea rather than a structured form within a form.
31. As a developer, I want each required field's label to carry a small red asterisk, so that I can see at a glance which fields will block submission.
32. As a developer, I want the Create button to be disabled until all four required fields are filled, so that an empty-field state is unreachable and I never see a redundant inline "Required" message.
33. As a developer, I want a Cancel button alongside Create, so that mouse users have an explicit close action that does not require finding the X.
34. As a developer, I want every newly created ticket to be assigned to me automatically using my Jira accountId, so that I never have to set Assignee in this form.
35. As a developer, I want the new ticket's label to always be set to `Frontend`, so that it appears in the team's standard label-filtered views without me having to tag it.
36. As a developer, I want the new ticket's status to be the workflow's initial status (assumed to be "New"), so that newly captured tickets land in the backlog rather than landing accidentally in an active column.
37. As a developer, I want the new ticket's priority to always be set to "Lowest" regardless of Type, so that auto-captured tickets never displace genuinely prioritised work; whoever triages later can raise priority deliberately.
38. As a developer, I want priority to be hidden in the form, so that the form does not invite a per-ticket "but this one is important" override that belongs to triage, not to capture.
39. As a developer, I want the new ticket to be created in the project configured by `JIRA_PROJECT_KEY`, so that the same code works for any team that adopts this dashboard.
40. As a developer, I want the form to submit via a single `POST /rest/api/3/issue` request to Jira, so that creation is one round-trip with no follow-up transitions on the happy path.
41. As a developer, I want the modal contents to be replaced by a centered spinner with the text "Creating your ticket…" while the request is in flight, so that the loading state is unmistakable and I do not double-submit.
42. As a developer, I want the modal to be locked (Escape and X disabled, Cancel disabled) while the request is in flight, so that I do not accidentally tear down the request before it lands.
43. As a developer, I want the in-flight request to be aborted via `AbortController` after 10 seconds and treated as an error, so that I am never stuck staring at a spinner because the network died.
44. As a developer, I want the post-timeout state to restore the form with my input intact and surface a toast saying the request timed out, so that I can retry without retyping anything.
45. As a developer, I want successful creation to close the modal, so that I can keep working on the board immediately.
46. As a developer, I want successful creation to fire a sonner toast `Created HDR-XXXX`, so that I get an immediate confirmation independent of where the new ticket lives.
47. As a developer, I want the success toast to include an `[Open]` action that opens the new ticket's detail panel in clashboard via `?issue=HDR-XXXX`, so that I can jump straight into the ticket I just created.
48. As a developer, I want the success toast to include a `[View in Jira]` action that opens the new ticket in Jira in a new tab, so that I can edit details Quick Create deliberately omits without first finding the ticket.
49. As a developer, I want successful creation to invalidate the board query so a refetch runs, so that if the new ticket happens to fall within the board's JQL it shows up as a card without me having to click Refresh.
50. As a developer, I want a failed creation to keep the modal open with my input preserved, so that I can read the error and retry without retyping the form.
51. As a developer, I want the failure toast to surface Jira's actual error message (parsed via the existing helper) rather than a generic "creation failed", so that the message is actionable when something is wrong with my input or with the project's create screens.
52. As a developer, I want the modal's open/close state to live as local React state in the Header rather than in the URL, so that the URL stays uncluttered and refresh-on-empty-form has no value to preserve.
53. As a developer, I want the in-progress epics query to share TanStack Query's cache with a 5-minute staleTime, so that repeatedly opening the modal in a working session is instant after the first fetch.
54. As a developer, I want the dropdown's hardcoded parents to live as a typed constant in the feature module rather than in `.env`, so that they are explicit, reviewable in source control, and not buried in a config file.

## Implementation Decisions

### Stack additions

- New runtime dependency: `@radix-ui/react-dialog` (Radix Dialog) for the modal's accessibility primitives — focus trap, return-focus, scroll lock, ARIA-correct dialog semantics.
- New runtime dependency: `@tanstack/react-form` (1.29.x stable; no v2 RC published at PRD time). Wired to Zod via Standard Schema.
- New runtime dependency: `zod` (4.x stable). Schemas are written in Zod 4 syntax. Used here for one form; the choice positions us for future forms without re-evaluating.
- No other new top-level dependencies. Sonner, lucide-react, Tailwind, TanStack Query, TanStack Start are already present.

### Trigger and keyboard shortcut

- The trigger is a primary-styled button rendered in `Header.tsx` immediately to the left of the existing search input. It matches the search input's height and uses an accent background color so it reads as the most-promoted action.
- The button content is a Plus icon, the label "New", and a small `kbd`-styled chip showing `c` on the right.
- A global `keydown` listener listens for `c` and opens the modal. The listener early-returns when `event.target` is an input, textarea, contenteditable element, or when any modifier (Ctrl/Meta/Alt) is pressed, or when the modal is already open. It uses `useEffect` registration owned by the trigger component itself.

### Modal infrastructure

- Built on Radix Dialog. The dialog uses `<Dialog.Root>`, `<Dialog.Portal>`, `<Dialog.Overlay>`, `<Dialog.Content>`, `<Dialog.Title>`, `<Dialog.Close>`.
- The dialog title is "Quick Create" (visible heading inside the modal).
- `onPointerDownOutside={e => e.preventDefault()}` disables backdrop-click close. `onEscapeKeyDown` is left at default behaviour (closes the modal). The X button uses `<Dialog.Close>`.
- Open/close state is local `useState` in the `<QuickCreateButton>` component. There is no URL parameter. The trigger renders both the button and the dialog as siblings so they share state without prop drilling.
- Initial focus is moved to the Summary input via `<Dialog.Content>`'s `onOpenAutoFocus={e => { e.preventDefault(); summaryRef.current?.focus(); }}` pattern.

### Form library

- Built on TanStack Form (`useForm` with a Zod-based Standard Schema validator). Validators run continuously; their messages are not rendered inline. The form's `state.canSubmit` drives the Create button's disabled state.
- Defaults are reset on every modal open (`defaultValues` keyed off a mount counter, or `form.reset()` in the dialog's `onOpenChange`).
- The form is composed of three field-level components: `<TypeSegmented>`, `<ParentSelect>`, `<SummaryInput>`, plus a plain `<textarea>` for Description.

### Field controls

- **Type** (`<TypeSegmented>`): three pill buttons in a single row, controlled by the form field. Each pill renders the matching lucide icon + label, picking colors from the same `TYPE_STYLES` record used by `TypeIcon` for cards. The selected pill is filled with its accent color; unselected pills are subdued. Default value: `Bug`.
- **Parent** (`<ParentSelect>`): a Radix Popover-based dropdown. The trigger reads the selected parent (`HDR-XXXX · Summary`) or the placeholder "Select a parent". The popover content has two sections: a "Pinned" section listing the three hardcoded parents, a divider, and a "My in-progress epics" section. Each row is clickable, sets the form field, and closes the popover. Loading state shows a single skeleton row in the dynamic section. Empty state shows a muted "No active epics assigned to you" line. Error state shows a quiet "Failed to load — retry" link in the dynamic section while the pinned section remains usable.
- **Summary** (`<SummaryInput>`): a flex container styled as a single input frame. Inside the frame, a non-interactive span renders `[FE]: ` in a muted color, followed by the actual `<input>` taking the remaining width. The container shows the focus ring; the inner input is borderless. The span has `aria-hidden="true"`; the input's `aria-label` is "Summary, prefixed with FE colon".
- **Description**: plain `<textarea>` with `rows={6}`, `resize-y`, full width, regular sans-serif, no autosize logic.

### Required-field affordances

- Each required field's label is rendered with a trailing `<span class="text-destructive">*</span>`. All four fields are required, so all four labels carry the asterisk.
- No inline error text under any field. The Create button is disabled until all required fields are filled, and the asterisks signal what is required.

### Submit lifecycle

- The form's `onSubmit` invokes a TanStack mutation hook (`useCreateIssueMutation`).
- The mutation owns an `AbortController`. It starts a 10-second timer on `mutate()` that calls `controller.abort()` when it fires.
- While `mutation.isPending`, the modal renders a centered spinner + the text "Creating your ticket…". Form fields are unmounted; the user's input is held in form state and re-renders if the mutation fails.
- The Cancel button, the X close button, and the `Escape` key are disabled during pending. (Radix's `onEscapeKeyDown` is conditionally `e.preventDefault()`'d while pending.)
- On success: the mutation invalidates the board's TanStack Query key. The dialog closes (open state set to false). A sonner toast renders `Created ${key}` with two action buttons: `Open` (sets `?issue=${key}` via the existing route helper) and `View in Jira` (window.open `${JIRA_BASE_URL}/browse/${key}` in a new tab).
- On failure: the mutation does **not** close the dialog. The form is re-rendered with values intact. A sonner error toast renders the message returned by the server function (parsed by the existing `parseJiraErrorMessage` helper).
- On timeout (`AbortError` reaches the mutation): treated identically to a failure, with the toast message "Request timed out — try again". Note that Jira may have already created the ticket on its end; the next polling tick or manual refresh will surface it.

### Jira API mapping

- Endpoint: `POST /rest/api/3/issue`.
- Request body shape:
  - `fields.project = { key: env.JIRA_PROJECT_KEY }`
  - `fields.issuetype = { name: "Bug" | "Task" | "Improvement" }`
  - `fields.priority = { name: "Lowest" }` — always, for all three types.
  - `fields.parent = { key: <selected parent key> }` — works for both umbrella ticket parents and epic parents on Jira Cloud.
  - `fields.assignee = { accountId: <currentUser.accountId> }` — pulled from the existing `getMyself` cache.
  - `fields.labels = ["Frontend"]`
  - `fields.summary = "[FE]: " + userInput`
  - `fields.description = <ADF doc from plain-text>`
- Status is **not** a settable field on create. We rely on the project's workflow initial status being "New". If a deployment of clashboard targets a Jira project whose workflow does not start at "New", we add a follow-up transition step in a future iteration; we do not prematurely build that branch here.

### Plain-text → ADF conversion

- The description text is split on `\n`. Each line maps to one ADF paragraph node. Empty lines map to empty paragraphs (a `paragraph` node with no `content`). The wrapping document is `{ type: "doc", version: 1, content: [...] }`.
- No marks (no bold/italic/links inferred from text). No code-block detection. The conversion is intentionally lossy in one direction only: what is rendered in Jira is whatever lines the user typed.

### Epic discovery

- A new server function `getMyEpics` runs the JQL `issuetype = Epic AND assignee = currentUser() AND status = "In Progress" AND project = ${env.JIRA_PROJECT_KEY}` against `searchIssues`, requesting only the `summary` field, and projects each issue to `{ key, summary }`.
- A client hook `useMyEpics` wraps it in TanStack Query with `enabled: modalOpen` and `staleTime: 5 * 60_000`. The query key is `['my-epics']`.
- The hardcoded parents live as `const HARDCODED_PARENTS: Array<{ key: string; label: string }>` at the feature module level — three entries: `HDR-3817 / "Tech Debt"`, `HDR-10519 / "DX"`, `HDR-11712 / "Support/Bug Umbrella"`.

### Auth and configuration

- No new env vars. Reuses `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`, `JIRA_PROJECT_KEY`. The current user's `accountId` is already resolved by the existing `getMyself` server function.
- The Jira API token lives server-side only — the client never sees it. All Jira interaction goes through TanStack Start server functions.

### Modules

- **`buildEpicJql`** (pure server): given a project key, returns the JQL string. Single input, single output.
- **`plainTextToAdf`** (pure shared): given a string, returns an ADF document node. No external dependencies.
- **`buildCreatePayload`** (pure server): given form input, current-user accountId, and project key, returns the request body the client will POST. Owns the `[FE]:` prefix concatenation, the always-set priority, the always-set label, and the field-shape contract with Jira.
- **`quickCreateSchema`** (Zod schema, shared): describes the validated shape of the form input (Type enum; Parent non-empty key; Summary non-empty string; Description non-empty string). Used by TanStack Form via Standard Schema.
- **`HARDCODED_PARENTS`** (const, shared): the three pinned parents, typed.
- **`jiraClient.createIssue`** (server, thin): a new method on the existing `jiraClient` that POSTs to `/rest/api/3/issue` and returns `{ key, id, self }`.
- **`createIssue`** (server function): validates input via the schema, calls `buildCreatePayload`, calls the client, returns a discriminated `{ ok: true; key } | { ok: false; reason: 'unauthorized' | 'rejected'; message: string }`. Reuses the existing `parseJiraErrorMessage` helper.
- **`getMyEpics`** (server function): orchestrates the epic JQL search; returns `Array<{ key: string; summary: string }>` or an unauthorized result.
- **`useMyEpics`** (client hook): TanStack Query wrapper; `enabled` flag from caller, 5-minute staleTime.
- **`useCreateIssueMutation`** (client hook): TanStack Mutation wrapper. Owns the AbortController + 10s timeout, the success-side board invalidation, the success-side sonner toast wiring (with `[Open]` and `[View in Jira]` actions), and the error-side sonner toast.
- **`<QuickCreateButton>`** (client): the top-bar trigger. Hosts the modal `useState`, the `c` shortcut listener, and the `<QuickCreateModal>` element.
- **`<QuickCreateModal>`** (client): the Radix Dialog wrapper. Renders either `<QuickCreateForm>` or the spinner view, depending on `mutation.isPending`. Owns the disabled-on-pending Escape/Close behaviour.
- **`<QuickCreateForm>`** (client): the TanStack Form instance and the four-field layout. Composes the field-level components.
- **`<TypeSegmented>`** (client): three-pill segmented control reusing `TYPE_STYLES`.
- **`<ParentSelect>`** (client): the sectioned Radix Popover dropdown.
- **`<SummaryInput>`** (client): the input frame with the pinned `[FE]: ` prefix.

## Testing Decisions

### What makes a good test

Same principle as the existing PRDs: tests assert a module's input/output contract, not its internal structure. Pure-function modules are tested directly with input/output. React components that are mostly composition are validated by manually opening the running app, not unit tests. The TanStack Query / Mutation / Form layers are configuration; we trust the libraries.

### Modules to test (Vitest)

- **`buildEpicJql`** — one or two cases: standard project key produces the expected literal JQL; the function does not silently mangle keys with special characters.
- **`plainTextToAdf`** — empty string produces a single empty paragraph; one-line input produces one paragraph with one text node; multi-line input produces N paragraphs, one per line; empty lines between lines produce empty paragraphs in the right positions; trailing newline does not produce a phantom paragraph (decision: trailing `\n` is treated as one trailing empty paragraph, mirroring how Jira itself renders).
- **`buildCreatePayload`** — every Type produces `priority: { name: "Lowest" }`; the summary is wrapped with `[FE]: `; labels is exactly `["Frontend"]`; parent key passes through unchanged; project key comes from the input arg, not a hardcoded constant; assignee uses `accountId` from the input arg; description is a doc node, not a string.
- **`quickCreateSchema`** — `safeParse` against a fully valid object succeeds; an empty Summary fails; an empty Description fails; an empty Parent key fails; an invalid Type ("epic") fails; the typed output matches the field contract `buildCreatePayload` expects.

### Modules not tested at the unit level

- **`jiraClient.createIssue`** — thin fetch wrapper; matches the existing decision to not unit-test the Jira client.
- **`useMyEpics`**, **`useCreateIssueMutation`** — TanStack Query/Mutation configuration only.
- **`<QuickCreateButton>`**, **`<QuickCreateModal>`**, **`<QuickCreateForm>`**, **`<TypeSegmented>`**, **`<ParentSelect>`**, **`<SummaryInput>`** — composition layers; manually verified by opening the running app.
- The `c` keyboard shortcut and the AbortController-driven timeout — UI integration with global event listeners and timers; manually verified.

### Prior art

The pure-function tests already in the repo — `features/board/status-mapping.test.ts`, `features/board/filter-issues.test.ts`, `server/jira/jql.test.ts`, `features/ticket-card/hash-color.test.ts` — are the templates. No new test infrastructure required.

## Out of Scope

- Creating tickets in any project other than the one configured by `JIRA_PROJECT_KEY`.
- Creating any issue type other than Bug, Task, Improvement (no Story, Epic, Spike, Sub-task).
- Creating tickets with a label other than `Frontend`, with a priority other than `Lowest`, with an assignee other than the current user, or with a status other than the workflow's initial.
- A "Create another" mode that resets the form after success without closing the modal.
- Persisting the last-used Type across modal opens. Type always resets to Bug.
- Persisting any draft state across page refreshes or modal close-and-reopen.
- Inline per-field error messages. The disabled-Create-button + asterisks pattern is the only validation affordance.
- Loading Jira description templates, ADF rich-text editing, Markdown shorthand, code-block detection, link auto-formatting in the Description field.
- Mentions, attachments, components, fix versions, due date, environment, time tracking, security level, reporter override.
- A confirmation dialog before discarding form contents on Escape or X. Quick Create is fast-by-design.
- Optimistic insertion of the new ticket as a card before the server confirms.
- Any mechanism to retry a request that failed midway (timeout); the user retries by clicking Create again.
- A persistent "Quick Create unavailable" indicator when Jira is degraded. Failures surface as toasts in response to user action only.
- Cross-project parent selection. The dynamic epics list is scoped to the configured project.
- Search inside the Parent dropdown. The list is short by design; search adds chrome with no ROI.
- A light-theme variant of the modal. The app is dark-only.
- Inferring or auto-filling `JIRA_PROJECT_KEY`-prefixed parent keys. The hardcoded parents are literal strings.
- A "+ Subtask" or "+ Linked issue" affordance on existing cards. This PRD is a top-bar global capture, not a per-card create.

## Further Notes

- The four hidden defaults (Status="New", Label="Frontend", Priority="Lowest", Assignee=me) are the *correct* defaults for this dashboard's audience, not lazy ones. The conscious decision to hide them — rather than show them grey-and-locked — keeps the form minimal at the cost of one note in this PRD that they exist.
- The "always Lowest priority" rule is opinionated: it expresses that auto-captured tickets must not displace genuinely-prioritized work. Triage raises priority later.
- "Status New" is implemented as "the workflow's initial status" rather than as an explicit field on the create call. This is correct for HDR's current configuration; it is a load-bearing assumption that will surface immediately on the first create test if wrong.
- Closing the modal on failure was an early UX option; it was rejected because it would discard the user's input on transient failures. The locked behaviour preserves input on every failure path including timeout.
- The 10-second timeout intentionally trades correctness for liveness: an aborted request may still create a ticket on Jira's side. The risk is acceptable because (a) the next polling tick or manual refresh will reveal the duplicate and (b) the alternative is a hung modal with no exit.
- The Parent dropdown's two-section design pins the most-used options regardless of what is on the user's plate. This is a deliberate "fast capture" affordance, not a generic Jira parent-picker.
- The `[FE]:` Summary prefix is enforced by *layout*, not by validation. A user who knows what they are doing and somehow types `[FE]:` themselves into the input will produce `[FE]: [FE]: ...` — accepted noise in exchange for zero validation logic.
- The reusable Radix Dialog primitive added by this PRD is expected to be the substrate for any future modal in the app; it is not Quick-Create-specific.
- The Zod dependency added here is one schema; future forms can adopt the same `Standard Schema` integration without re-evaluating the library choice.
