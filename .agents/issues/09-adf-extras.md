# 09 — ADF renderer (extras)

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

Round out the ADF renderer with the remaining node types likely to appear in real tickets, and a graceful fallback for everything else.

- **`mention`** — render `attrs.text` (e.g. `@Jane Doe`) as an inline pill or styled span.
- **`emoji`** — render the unicode glyph from `attrs.text` (or `attrs.shortName` fallback).
- **`mediaSingle`** / **`mediaGroup`** — render an inline image when the URL is available in `attrs`. If only an `id` is present and no URL, render a small placeholder noting the media is hosted in Jira (link to "Open in Jira").
- **`status`** — small inline pill with the status's color; `attrs.text` provides the label.
- **`panel`** — block container with appropriate styling for `panelType` ∈ `info`, `note`, `warning`, `error`, `success`.
- **Fallback** — any unsupported node type renders as a faint `[unsupported: <type>]` placeholder. Renderer must not throw on unknown nodes.
- Snapshot tests for each new node type and the fallback.

## Acceptance criteria

- [ ] Mentions render their `attrs.text` inline.
- [ ] Emojis render the unicode glyph.
- [ ] Media renders as an inline image when an image URL is present in `attrs`.
- [ ] Media renders a small placeholder + "Open in Jira" link when only an `id` is available.
- [ ] Status nodes render as inline pills with the configured color and label.
- [ ] Panel nodes render with distinct visual treatment per `panelType` (info / note / warning / error / success).
- [ ] Unknown node types render as `[unsupported: <type>]` in a faint color and do NOT throw.
- [ ] Snapshot tests cover each new node type and the fallback.

## Blocked by

- [06 — ADF renderer (core nodes)](./06-adf-core.md)
