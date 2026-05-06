# 06 — ADF renderer (core nodes)

**Type:** AFK

## Parent

[clashboard PRD](../prds/clashboard.md)

## What to build

A custom ADF → React renderer covering the node types most common in this team's tickets (text, headings, paragraphs, lists, code, links). Replaces the plain-text description in the detail panel.

- **`<RenderAdf doc={...} />`** in `features/ticket-detail/adf/`.
- Recursive switch on `node.type`. Per-node sub-components in `features/ticket-detail/adf/nodes/`.
- **Supported node types this slice**: `doc`, `paragraph`, `heading` (levels 1–6), `text` (with marks `strong`, `em`, `code`, `link`, `strike`), `bulletList`, `orderedList`, `listItem`, `codeBlock`, `blockquote`, `hardBreak`, `rule`.
- Marks compose (e.g. bold + code on same text node).
- Links open in a new tab (`rel="noopener noreferrer"`).
- Code blocks render with monospace font and a visible code-block background (Tailwind utilities).
- Styling matches the dark theme; typography polished (the team mostly writes prose, so paragraph + heading polish is the highest-leverage).
- Replace plain-text description in the detail panel with the ADF renderer.
- **Snapshot tests** for each supported node type in isolation, plus a few real-world fixtures combining nodes.

## Acceptance criteria

- [ ] `<RenderAdf>` renders all listed node types correctly.
- [ ] Marks compose (bold + italic + code on the same text segment work together).
- [ ] Links are clickable, open in a new tab, with `rel="noopener noreferrer"`.
- [ ] Code blocks visually distinct (monospace, background).
- [ ] Headings rendered with appropriate sizes (h1 largest, h6 smallest).
- [ ] Description in the detail panel uses the ADF renderer (plain-text placeholder removed).
- [ ] Snapshot tests cover each supported node type.
- [ ] Snapshot tests cover at least one fixture combining multiple node types.
- [ ] Renderer styled consistently with the dark theme (no jarring color contrasts).

## Blocked by

- [05 — Detail panel (read-only, plain text)](./05-detail-panel.md)
