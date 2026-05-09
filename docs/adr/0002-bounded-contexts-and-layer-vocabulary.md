# Bounded contexts as the organising axis, with a single layer vocabulary

clashboard organises code around **bounded contexts** (`Board`, `Detail`, `Review`, `Capture`), each an internal hexagon, with a small set of named layers shared across contexts: `domain`, `gateway`, `application service`, `view-model`, `presenter`, `view`, and a top-level `coordinator` for cross-context workflows. The dependency graph is a strict DAG enforced by `dependency-cruiser`.

The driver is a team-template angle: TypeScript frontend projects lack a shared idiom for clean architecture comparable to Spring or modern PHP. clashboard becomes the worked example. Reference-implementation pedagogy supersedes minimalism — the architecture must be *legible* to a reader walking in cold, not just *minimal* for the author.

## Considered Options

- **Feature folders (status quo).** `src/features/{board, ticket-detail, ...}` with each feature a free-form vertical slice. *Rejected:* the import graph is a near-mesh — `ticket-detail → status-pill, ticket-card, mr-status, board`; `ticket-card → status-pill, mr-status, board`; `mr-status → board`. There is no rule distinguishing a *bounded context* (Board, Detail) from a *reusable widget* (StatusPill, TicketCard, MrSection); both are "features." The word "service" is overloaded — `JiraIssueService` is a server-side gateway-orchestrator while `DashboardService` is a client-side use-case layer; readers cannot tell which is which without reading the body.
- **Thin viewer with no domain.** Domain ≡ Atlassian + GitLab; clashboard collapses to `gateway → application → presentation` with no entity layer. *Rejected:* honest about what clashboard is, but too thin to teach from. The reference implementation needs visible layers; a two-layer codebase doesn't show what an application service *is*.
- **Domain layer above contexts.** A `WorkItem` entity with invariants the app enforces. *Rejected:* clashboard never mutates an issue locally — it transitions, optimistically patches, refetches. There are no invariants we own that aren't already owned by Jira; inventing a `WorkItem` class would produce dead structure for pedagogy's sake.
- **Bounded contexts with internal hexagons (selected).** `src/contexts/{board, detail, review, capture}/` each with `domain/`, `application/`, `view-model/`, `presenter/`, `view/`. Cross-context workflows in `src/coordinator/`. Reusable visual surfaces in `src/widgets/{status-pill, ticket-card, mr-section, fixasap-ribbon}/`. Cross-context types and domain logic in `src/kernel/`. Domain-agnostic primitives in `src/design-system/` (shadcn, on second use). The dependency graph is a strict DAG: `routes → contexts → widgets → coordinator → contexts/<name>/application → kernel`.

## Layer vocabulary

| Layer | What it is | What it knows |
|---|---|---|
| Domain | Pure functions over kernel types. | Domain rules. |
| Gateway | Port + adapter to an external system. | The external API contract. |
| Application service | Use-cases for one context. Framework-free factory. | Its context's gateways, caches, clocks, domain logic. |
| View-model | Framework-free state machine + derivation. ts-pattern. | Application-service results + UI inputs. |
| Presenter | Thin React adapter binding the view-model. | React, TanStack Query, TanStack Router, view-model. |
| View | React components. | Presenter output + design-system primitives. |
| Coordinator | Cross-context workflows. | Multiple application services. |

"Service" alone is never used.

## The dependency law

Allowed edges:

- `routes` → `contexts/<name>` (barrel), `coordinator/provider`
- `contexts/<name>` → `kernel`, `coordinator`, `widgets`, `design-system`, `lib`
- `widgets/<name>` → `kernel`, `coordinator`, `design-system`, `lib`, sibling widgets within one widget family
- `coordinator` → `contexts/<name>/application`, `kernel`, `lib`
- `contexts/<name>/application` → `kernel`, gateway/cache **ports** declared inside the context
- `contexts/<name>/domain` → `kernel` only
- `kernel` → `server` (re-export)

Forbidden edges (enforced by `dependency-cruiser`):

- `contexts/A → contexts/B` for any A ≠ B
- `widgets/<any> → contexts/<any>`
- `coordinator → contexts/<name>/{view, presenter, view-model}`
- `contexts/<name>/{domain, application, view-model} → react / @tanstack/react-* / sonner / window / document`
- `widgets/<name> → @tanstack/react-query` outside its own presenter file
- `kernel → contexts/* / widgets/* / coordinator/* / routes/*`

## Consequences

- **Cross-context coordination has a home.** Workflows that span contexts (apply transition, handle MR merged, create issue) live in the coordinator, which depends on context application services. Contexts never depend on the coordinator's siblings.
- **`kernel/` owns previously context-bound types.** `Column`, `columnForStatus`, `statusesForColumn`, `deemphasize` move out of Board into `kernel/`. Board uses them more than anyone but no longer owns them.
- **Reusable visual surfaces become first-class widgets.** `status-pill`, `ticket-card`, `mr-section`, `fixasap-ribbon` move to `widgets/`. They depend on the coordinator for actions but never on contexts.
- **Scaffolding is a one-time PR (Phase 0).** Empty `kernel/`, `contexts/`, `widgets/`, `design-system/`, `coordinator/` folders are created with `dependency-cruiser` rules from day one; existing code under `features/` continues to work; migration moves files into the new shape one context at a time, exemplar-first (Board), with the e2e harness as the safety net.
- **Convention names disappear from prose.** "Service" is replaced everywhere by the specific layer: `JiraGateway`, `BoardApplicationService`, `Coordinator`. Reviews can ask "which layer is this?" rather than "is this the right service?"
