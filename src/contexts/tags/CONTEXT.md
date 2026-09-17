# Tags — context

Local, user-defined coloured labels attached to tickets. Purely a **local-machine
annotation layer**: tags never touch Jira or GitLab. They are defined in a header
menu, attached/detached from the ticket detail panel, and displayed as a divided
row of coloured chips on each board card.

Distinct from **Jira labels** (`BoardIssue.labels`, the `CardLabels` dots, the
detail "Labels" field), which are read-only strings from Jira. "Tag" is always the
local concept; "label" is always the Jira one.

## Language

- **Tag definition** — a `{ id, name, colorId }` the user curates. `colorId` names
  a member of the fixed `TAG_COLORS` palette (kernel).
- **Attachment** — a `(issueKey → tagId[])` pin. Order is preserved.
- **Tags state** — the whole store: `{ definitions, attachments }`.
- **Palette** — 20 fixed colour combinations in `~/kernel` (`TAG_COLORS`); the
  first, `critical`, is bright red on bright white, reserved for the loudest flag.

## Storage

One JSON file, `~/.clashboard/tags.json`, via `~/server/lib/tags-store.ts`
(dependency-injected `fs`, fault-tolerant reads, validate-on-write, cascade delete).
This mirrors the watchlist store. Because tags involve **no external system**, the
server functions (`~/server/server-functions/tags.ts`) are plain try/catch handlers
over the store — there is no Effect server context (contrast the watchlist, whose
read path hydrates Jira cards and therefore needs Effect).

## Layers here

| Layer          | File(s)                                            | Role                                                                          |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------- |
| **View-model** | `view-model/tag-manager-view-model.ts`             | Pure reducer for the manager modal's create-draft (open, draft name/colour).  |
| **Presenter**  | `presenter/use-tags.ts`                            | Shared `['tags']` query; `select` narrows to definitions / one ticket's tags. |
|                | `presenter/use-tag-mutations.ts`                   | create / update / delete / attach / detach mutations; invalidate on success.  |
|                | `presenter/use-tag-manager.ts`                     | Binds the reducer + mutations into the `TagManagerApi`.                       |
| **View**       | `view/TagManagerButton.tsx` + modal + row + picker | Header menu to curate the palette.                                            |

The client **application-service exemplar** (ports + neverthrow service + fake
gateway) is intentionally omitted: like the watchlist's live path, presenters call
the server functions directly, and tags have no error taxonomy to model beyond a
mutation `{ ok }` result.

## Cross-context consumption

Tags are needed outside this context, so the public hooks are re-exported through
the **coordinator** and consumed there (never by importing `~/contexts/tags`
directly):

- **Board card** (`widgets/ticket-card/view/CardTags.tsx`) — `useTicketTags(key)`,
  same per-card-hook shape as `useMrFor` / `useWorkspaceOpen`; renders the divided
  chip row.
- **Detail panel** (`contexts/detail/view/TagControls.tsx`) — `useTagDefinitions`,
  `useTicketTags`, `useAttachTag`, `useDetachTag`; builds its own attach/detach UI,
  mirroring how `WatchlistAction` consumes the watchlist through the coordinator.

## Public surface

`index.ts` exports `TagManagerButton` (for the header) and the hooks the
coordinator re-exports: `useTicketTags`, `useTagDefinitions`, `useAttachTag`,
`useDetachTag`, `useInvalidateTags`.

## Not in scope

No board filtering/search by tag, no optimistic patch/rollback (local I/O is fast
and atomic — mutations invalidate the single shared query), no sharing across
machines.
