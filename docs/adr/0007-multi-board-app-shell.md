# A left-nav app shell with more than one board

clashboard grows from a single board to **two board surfaces** — the main assigned-work board (`/`) and a **Watchlist Board** (`/watchlist`) — switched from a **left nav rail** in a shared app shell. Both boards live under one shell (`src/routes/-app-shell.tsx`): a `NavRail` (`src/routes/-nav`), a variant-aware `Header`, the board itself, and the single detail panel. Each board is its own TanStack Router file-route; the shell picks the board and the header's tool set from a `variant: 'main' | 'watchlist'` prop.

The proximate driver is product: the watchlist sub-section pinned inside the main board's "In Implementation" column overflows once the watchlist grows past a handful of tickets. Rather than break that sub-section (it stays, unchanged), the watchlist gets a dedicated surface that scales — the same cards laid out in **tag-filtered swimlanes** the user configures (each lane bound to one or more tags — a card lands in a lane when it carries any of them; persisted at `~/.clashboard/watchlist-lanes.json`). The ultimate driver is **keeping the routing tree honest about surfaces**: a board the URL can name and the browser back-button can return to, not a board hidden behind client-only view state.

## Considered options

- **(a) One route, a client-state toggle between boards.** A single `/` route with local state (or a query param) choosing which board renders. _Rejected:_ the board a user is on is real navigational state — it deserves a URL, an active nav item, and back-button behaviour. A toggle buries it in component state and makes the detail panel's `?issue=` deep-link ambiguous about which board it belongs to.

- **(b) A new bounded context for the watchlist board.** A `contexts/watchlist-board/` hexagon separate from the existing `watchlist` context. _Rejected:_ the watchlist board is a _view_ of the watchlist the context already owns (the curated key list, the hydrated cards). Splitting it off would force a cross-context dependency for the cards, or duplicate the card-loading path, and would add a full set of new dependency-cruiser rules. The board grows the existing `watchlist` context instead — cohesive, and reuses the context's existing rules (one new `watchlist-domain-only-imports-kernel` rule, and the view-model rule widened to permit the new `domain/`).

- **(c) A shared layout route (pathless) owning the shell.** TanStack Router pathless layout route wrapping both boards. _Rejected for now:_ the two routes are tiny (each ~10 lines delegating to `AppShell`), so a plain shared `AppShell` component is simpler than a layout-route indirection and keeps search-param state per board. The upgrade path to a layout route is open if a third board arrives.

## Consequences

- **Routes still wire contexts; contexts do not know about the shell.** `NavRail`, `AppShell`, and the `Header` variant live in `routes/` — the only place multiple contexts compose. The `watchlist` context exports `WatchlistBoard` and `LaneConfigButton`; it has no knowledge of the nav rail or the main board. Tags reach the board through the coordinator re-export (`useTagsState`), never a `contexts/tags` import — the no-cross-context law holds.

- **The header is variant-aware, not duplicated.** One `Header` takes `variant`; the watchlist board drops **New** (you don't create tickets you only advise on) and **Only Workspace** (workspace focus is a main-board concern) and adds **Configure lanes**. No second header component.

- **Card and panel navigation became board-relative.** `TicketCard` and the detail-panel presenter navigate with `to: '.'` instead of `to: '/'`, so opening/closing the detail panel or stepping through siblings keeps the user on whichever board they came from. Both routes share one search schema (`?issue=&notes=`).

- **Lane configuration is server-side local JSON**, consistent with tags/watchlist/notes (`~/.clashboard/*.json`); per-lane collapse state is per-viewer localStorage, consistent with the main board's collapsed-Done preference.

- **The Watchlist Board has no change-indication animation.** A deliberate simplification: the main board's enter/leave/pulse reducer is not reproduced. The watchlist board's view-model is a pure `derive` with no reducer.
