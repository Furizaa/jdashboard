# 72 — Media lightbox + shadcn Dialog adoption

**Type:** AFK

## Parent

[ADF rendering extensions PRD](../prds/adf-rendering-extensions.md)

## What to build

The user-visible delivery for media. Refactors the in-document `Media` view into a clickable preview button (image bitmap or video first-frame poster + play overlay), opens a 95vh × 95vw lightbox modal on click, plays videos with native HTML5 controls (`autoplay muted`), and wires a `LightboxOpenContext` that gates the panel's `Escape`/J/K/O/C keyboard shortcuts while a lightbox is open. Promotes the shadcn Dialog primitive into `design-system/` per the documented adopt-on-second-use rule and migrates the existing `QuickCreateModal` to consume it.

After this slice merges, clicking on an image or video in any Detail panel opens the lightbox; pressing Escape closes only the lightbox (the panel stays open); the panel's J/K shortcuts are inert while the lightbox is open; the codebase has one shared Dialog primitive instead of one direct Radix import in Capture and another in Detail.

Concretely:

- **Generate the shadcn Dialog primitive** into `src/design-system/dialog.tsx`:
  - `pnpm dlx shadcn@latest add dialog` (or copy the canonical shadcn source if the repo's `components.json` is configured for an alternate path).
  - Exposes the standard composition surface: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`, plus `DialogPortal`/`DialogOverlay` if the generated source separates them.
  - Re-exported from `src/design-system/index.ts`.
- **Migrate `src/contexts/capture/view/QuickCreateModal.tsx`** from direct `@radix-ui/react-dialog` usage to the new `~/design-system/dialog` primitive:
  - `Dialog.Root → Dialog`; `Dialog.Portal/Overlay/Content → DialogContent` (which composes Portal + Overlay internally per the shadcn pattern); `Dialog.Title → DialogTitle`; `Dialog.Close → DialogClose`.
  - Preserve all existing behaviour: `onPointerDownOutside` prevented, `onOpenAutoFocus` redirected to the Summary input, Escape and X close, `onEscapeKeyDown` disabled while pending.
  - The custom width / centred positioning / overlay opacity may need a className override at the call site if the shadcn defaults differ from QuickCreate's existing styling.
  - QuickCreate's existing E2E spec is the regression gate — no new tests added here.
- **`Media.tsx` refactor** in `src/contexts/detail/view/adf/nodes/`:
  - Branches on `attrs.url` presence (current behaviour) and on `attrs.mimeType` (new).
  - When `url` is present and `mimeType` starts with `video/`: render a clickable `<button>` containing `<video preload="metadata" muted className="...preview...">` (no `controls`, first frame visible) plus a centred play-icon overlay (`<Play>` from lucide-react). The button opens `<MediaLightbox kind="video" ... />` on click.
  - When `url` is present and `mimeType` starts with `image/` (or `mimeType` is missing): render a clickable `<button>` containing `<img>` styled as a preview. The button opens `<MediaLightbox kind="image" ... />` on click.
  - When `url` is absent (server failed to enrich): render the existing "Media hosted in Jira" placeholder unchanged.
  - The button has accessible labelling: `aria-label={alt ?? 'View media'}`.
- **New view component** `src/contexts/detail/view/adf/nodes/MediaLightbox.tsx`:
  - Built on the new `~/design-system/dialog` primitive.
  - Props: `{ kind: 'image' | 'video'; url: string; alt?: string; jiraBaseUrl?: string; open: boolean; onOpenChange: (open: boolean) => void }`.
  - `<Dialog open onOpenChange><DialogContent className="...95vh 95vw, no padding...">...</DialogContent></Dialog>`.
  - Image: `<img src={url} alt={alt} className="max-h-full max-w-full object-contain" />`.
  - Video: `<video src={url} controls autoPlay muted preload="auto" className="max-h-full max-w-full" />`.
  - Close button (`<DialogClose>`) floats top-right with a translucent background.
  - On `<img onError>` / `<video onError>`: swap inner content to `<MediaUnavailable jiraBaseUrl={jiraBaseUrl} />`.
  - State (`open`) is owned by the parent `Media` node via `useState`, passed in as controlled props. No internal open-state.
- **New view component** `src/contexts/detail/view/adf/nodes/MediaUnavailable.tsx`:
  - Small inline error chip ("Media unavailable") with an Open-in-Jira link when `jiraBaseUrl` is provided.
  - Reused inline (when in-document `<img>` / `<video>` errors) and inside the lightbox (when the modal-mounted media errors).
- **`LightboxOpenContext`** — new file `src/contexts/detail/view/lightbox-open-context.ts` (or colocated near `IssueDetailPanel`):
  - `export const LightboxOpenContext = React.createContext<boolean>(false)` plus a `<LightboxOpenProvider>` component that reads from a small "count of open lightboxes" counter.
  - The counter exposes `register()`/`unregister()` callbacks via a separate context (or a single context whose value is `{ isOpen: boolean; register: () => void; unregister: () => void }`).
  - Each `MediaLightbox` calls `register` on mount-while-open and `unregister` on unmount-or-close via `useEffect`.
  - `IssueDetailPanel` mounts the provider above its own children so every nested `MediaLightbox` flows through it.
- **Presenter gating** in `src/contexts/detail/presenter/use-issue-panel.ts`:
  - Both `useEscapeToClose` and `usePanelShortcuts` read the lightbox-open boolean via a new `useLightboxOpen()` hook (or accept it as a parameter from the consumer).
  - When the boolean is `true`, both effects skip their `keydown` handler (early return without `preventDefault`).
  - The implementation choice — read context directly inside the existing hook vs. pass the boolean as a parameter — is the implementer's call; the test signal is the same.
- **`Media.tsx` wiring**:
  - Each `Media` instance owns a `useState<boolean>` for `lightboxOpen`. The button's `onClick` sets it to `true`; the lightbox's `onOpenChange` sets it to false.
  - The `MediaLightbox` is rendered as a sibling of the preview button inside `Media`'s JSX tree.
- **New E2E spec** `tests/e2e/ticket-detail/adf-media-lightbox.spec.ts`:
  - Three cases. Each seeds a Detail issue with one media node whose `attrs.url` and `attrs.mimeType` are set by the e2e fixture (mirroring the post-slice-71 wire shape).
  - **Case 1**: image media. Click the preview button; assert `role="dialog"` is visible; assert the modal contains an `<img>` with the seeded src; press Escape; assert the modal is gone but the surrounding panel `role="dialog"` is still visible.
  - **Case 2**: video media. Click the preview button; assert the modal contains a `<video>`; assert `autoplay`, `muted`, and `controls` attributes are set; close via the × button.
  - **Case 3**: error path. Mock the proxy URL to return 404 (or seed an unreachable URL). Click the preview button; assert the inline error chip ("Media unavailable") is visible inside the modal.
- **New MSW handlers** in the e2e fixture infrastructure:
  - Handler for `POST /rest/api/3/media-tokens` returning a canned token bundle.
  - Handler for `GET /api/jira-media/<id>` (the proxy URL injected into ADF) returning canned binary on success and 404 on the error case.
  - These handlers are added to the existing world/factory infrastructure used by `tests/e2e/fixtures/`.
- **Doc update**: the client `src/contexts/detail/CONTEXT.md` parts that describe `MediaLightbox`, `LightboxOpenContext`, the button-wrapped preview, and the `<MediaUnavailable>` chip are already drafted in the grill conversation; commit them as part of this slice.

## Acceptance criteria

- [ ] `src/design-system/dialog.tsx` exports the standard shadcn Dialog composition surface (`Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`).
- [ ] `src/contexts/capture/view/QuickCreateModal.tsx` no longer imports from `@radix-ui/react-dialog` directly; it consumes the new design-system primitive. The QuickCreate E2E spec passes unchanged.
- [ ] `src/contexts/detail/view/adf/nodes/Media.tsx` branches on `attrs.url` presence and `attrs.mimeType` prefix:
  - `mimeType` starts with `video/` → button-wrapped `<video preload="metadata">` poster + play overlay.
  - `mimeType` starts with `image/` (or absent with `url` present) → button-wrapped `<img>` preview.
  - `url` absent → existing "Media hosted in Jira" placeholder (unchanged).
- [ ] Each preview button has `aria-label` derived from the media's alt text (or a default).
- [ ] `MediaLightbox` renders at 95vh × 95vw, contains the image or video, and closes on Escape, backdrop click, and the × button.
- [ ] Video lightbox has `autoplay`, `muted`, and `controls` attributes set.
- [ ] `MediaUnavailable` is rendered in place of the image/video when `onError` fires (both in-document and inside the lightbox).
- [ ] `LightboxOpenContext` exists, is provided by `IssueDetailPanel`, and registers/unregisters lightboxes on mount/unmount.
- [ ] The Detail presenter's `useEscapeToClose` and `usePanelShortcuts` skip their handlers when the context's boolean is `true`. Verified by E2E case 1 (Escape closes only the lightbox).
- [ ] `tests/e2e/ticket-detail/adf-media-lightbox.spec.ts` exists with the three documented cases.
- [ ] MSW handlers for `POST /rest/api/3/media-tokens` and `GET /api/jira-media/<id>` are added to the e2e fixture infrastructure.
- [ ] `src/contexts/detail/CONTEXT.md` updates (already drafted) are committed.
- [ ] No regressions in QuickCreate (existing E2E green).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.

## Blocked by

- [71 — Server-side Jira media proxy + ADF media enrichment](./71-server-jira-media-proxy.md)
