# 70 — ADF code blocks with syntax highlighting

**Type:** AFK

## Parent

[ADF rendering extensions PRD](../prds/adf-rendering-extensions.md)

## What to build

Pure client-side slice. Adds Shiki-based syntax highlighting to ADF `codeBlock` nodes whose `attrs.language` resolves to a supported language, with on-demand grammar loading and lazy initial bundle. Code blocks with no language, or a language outside the curated allowlist, continue to render as today's plain `<pre><code>` block with no JS dependency loaded.

After this slice merges, opening a ticket with a JavaScript snippet renders it with token-level catppuccin-mocha highlighting; the highlighter chunk does not appear in the initial bundle of `/`; per-language grammars load on demand the first time each language is rendered.

Concretely:

- **New runtime dependency**: `shiki` (version current at PR-open time). Pinned. Imported via the `shiki` package's lazy core (`createHighlighterCore` + dynamic grammar imports) — **not** via `shiki/bundle/web` (which would ship every grammar in one chunk).
- **New domain function** `src/contexts/detail/domain/normalize-code-language.ts`:
  - Public `normalizeCodeLanguage(raw: string | null | undefined): string | null`.
  - Table-driven lookup: canonical names are recognised as themselves; aliases (`js → javascript`, `ts → typescript`, `tsx → tsx`, `jsx → jsx`, `py → python`, `sh → bash`, `cs → csharp`, `c++ → cpp`, etc.) map to canonical Shiki identifiers.
  - Allowlist (Phase 1): `javascript`, `typescript`, `tsx`, `jsx`, `python`, `go`, `rust`, `java`, `kotlin`, `csharp`, `cpp`, `sql`, `json`, `yaml`, `xml`, `html`, `css`, `bash`, `shell`, `markdown`, `dockerfile`.
  - Returns `null` for missing, empty, or unrecognised input. Case-normalised.
- **New domain test** `normalize-code-language.test.ts` — table-driven over canonical names, every documented alias, unknown strings, `undefined`, empty string, mixed case.
- **New view component** `src/contexts/detail/view/adf/nodes/HighlightedCode.tsx`:
  - `React.lazy`-imported. The component module dynamically imports `shiki/core` and `@shikijs/themes/catppuccin-mocha` plus the requested language grammar lazily.
  - Renders a `<pre><code>` initially (matching `PlainCodeBlock` markup), then upgrades the inner HTML to Shiki's HAST-derived output via `dangerouslySetInnerHTML` once highlighting completes.
  - Theme is hard-coded to `catppuccin-mocha`. No theme prop.
  - Props: `{ language: string; code: string }`. Both required (the dispatch in `CodeBlock.tsx` only renders this component when `language` is non-null).
  - Uses a single shared `getSingletonHighlighter` instance loaded lazily; second use of a language reuses the cached grammar.
  - Falls back to plain rendering on any Shiki error (e.g. grammar load failure).
- **`CodeBlock.tsx` refactor**:
  - Extracts plain-text from the node's children once via a small `extractText` helper (recursive concatenation of `text` nodes).
  - Calls `normalizeCodeLanguage(node.attrs?.language)`.
  - `null` → renders the existing `<pre><code>` markup (current behaviour, no JS dep).
  - Non-null → renders `<Suspense fallback={<PlainCodeBlock>{children}</PlainCodeBlock>}><HighlightedCode language={lang} code={text} /></Suspense>`.
  - The existing `CodeBlock` component continues to accept `children` (so the renderer's existing wiring stays working); the language-aware path passes the extracted text to `HighlightedCode` and lets the plain-fallback render the children directly.
  - Move the existing plain markup into a `PlainCodeBlock` subcomponent for reuse between the no-language path and the Suspense fallback.
- **Wire `attrs.language` into the renderer**:
  - `RenderAdf.tsx`'s `codeBlock` branch currently calls `<CodeBlock>{renderChildren(...)}</CodeBlock>`. Pass the node's `attrs` through so `CodeBlock` can read `attrs.language`.
- **Update `RenderAdf.test.tsx`**:
  - Existing `'renders codeBlock'` case continues to assert the plain output (no language → no highlighting).
  - New case: code block with a recognised `language` renders the lazy-loaded markup. The test should assert the synchronous fallback (the plain `<pre><code>` markup) since the lazy import does not resolve in the unit-test environment without extra setup; documented in the test as the contract under test.
  - New case: code block with an unrecognised `language` (e.g. `'gobbledygook'`) renders as plain.
- **Extend the existing E2E** `tests/e2e/ticket-detail/adf-rendering.spec.ts`:
  - Add a `codeBlock` to the description fixture with `attrs: { language: 'typescript' }`.
  - Assert the rendered output contains a `<pre>` with at least one Shiki-generated `<span>` element (token coloring).
  - Existing `code-block-content` assertion against the language-less code block continues to pass.
- **Bundle verification**:
  - After this slice, `pnpm build` and inspect the dist output. The `shiki` chunk and language-grammar chunks must appear as separate code-split chunks (not in `index-*.js`). Document the expected chunk shape in the PR description so future readers can confirm.

## Acceptance criteria

- [ ] `shiki` is added as a runtime dependency and pinned.
- [ ] `src/contexts/detail/domain/normalize-code-language.ts` exports `normalizeCodeLanguage` and recognises every language in the Phase 1 allowlist plus the documented aliases.
- [ ] `normalize-code-language.test.ts` covers canonical names, aliases, unknown input, `undefined`, empty string, mixed case.
- [ ] `src/contexts/detail/view/adf/nodes/HighlightedCode.tsx` exports a default `React.lazy`-imported component that renders the code with `catppuccin-mocha` highlighting.
- [ ] `src/contexts/detail/view/adf/nodes/CodeBlock.tsx` dispatches through `normalizeCodeLanguage` and renders either the plain block or the Suspense-wrapped `HighlightedCode`. The plain branch loads no Shiki code.
- [ ] `RenderAdf.tsx` passes the codeBlock node's `attrs` to `CodeBlock`.
- [ ] `RenderAdf.test.tsx` covers: code block without language renders plain (existing behaviour); code block with recognised language renders the Suspense fallback in the unit-test environment; code block with unrecognised language renders plain.
- [ ] `tests/e2e/ticket-detail/adf-rendering.spec.ts` asserts the highlighted markup for a `typescript` code block.
- [ ] `pnpm build` produces a Shiki chunk and per-language grammar chunks separate from the initial `/` bundle. Documented in the PR description.
- [ ] No imports from `react`, `@tanstack/react-*`, `sonner`, `window`, or `document` in `normalize-code-language.ts` (verified by `dependency-cruiser`).
- [ ] `pnpm typecheck && pnpm lint && pnpm depcruise && pnpm check:arch && pnpm test && pnpm test:e2e` all green.

## Blocked by

None — can start immediately.
