// The app's code highlighter: one shiki core instance, one theme, and a
// lazy-loaded grammar per language.
//
// This was `contexts/detail/view/adf/nodes/HighlightedCode.tsx`'s private
// machinery until Explain's finding blocks needed to highlight a diff hunk. A
// second consumer is exactly the adopt-on-second-use trigger (CONTEXT-MAP,
// "Design-system primitives"), so it is **extracted** rather than copied — one
// highlighter instance, one grammar cache, one theme for the whole app.
//
// Everything is lazy. `shiki/core` and each grammar are dynamic imports, so a
// screen with no code on it pays nothing, and a page that only ever shows
// TypeScript never loads the Python grammar.

/** Catppuccin Mocha — already the app's code theme, and the only one. */
export const CODE_THEME = 'catppuccin-mocha'

const LANGUAGE_LOADERS: Record<string, () => Promise<unknown>> = {
  javascript: () => import('@shikijs/langs/javascript'),
  typescript: () => import('@shikijs/langs/typescript'),
  tsx: () => import('@shikijs/langs/tsx'),
  jsx: () => import('@shikijs/langs/jsx'),
  python: () => import('@shikijs/langs/python'),
  go: () => import('@shikijs/langs/go'),
  rust: () => import('@shikijs/langs/rust'),
  java: () => import('@shikijs/langs/java'),
  kotlin: () => import('@shikijs/langs/kotlin'),
  csharp: () => import('@shikijs/langs/csharp'),
  cpp: () => import('@shikijs/langs/cpp'),
  sql: () => import('@shikijs/langs/sql'),
  json: () => import('@shikijs/langs/json'),
  yaml: () => import('@shikijs/langs/yaml'),
  xml: () => import('@shikijs/langs/xml'),
  html: () => import('@shikijs/langs/html'),
  css: () => import('@shikijs/langs/css'),
  bash: () => import('@shikijs/langs/bash'),
  shell: () => import('@shikijs/langs/shell'),
  markdown: () => import('@shikijs/langs/markdown'),
  dockerfile: () => import('@shikijs/langs/dockerfile'),
}

/**
 * The short names people and agents actually write, mapped to the grammar they
 * mean. Shiki knows these aliases internally, but the loader map above is keyed
 * by canonical name, so the alias has to be resolved before the lookup.
 *
 * Added with the extraction: an Explain hunk's `language` comes from an agent,
 * which writes `ts` as readily as `typescript`. Consumers that previously fell
 * back to plain text for an alias now highlight — strictly more highlighting,
 * never less.
 */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  cs: 'csharp',
  'c++': 'cpp',
  yml: 'yaml',
  sh: 'bash',
  zsh: 'bash',
  console: 'shell',
  md: 'markdown',
  golang: 'go',
  kt: 'kotlin',
  docker: 'dockerfile',
}

/** The grammar a language name resolves to, or `null` when we have none. */
export function resolveLanguage(language: string): string | null {
  const lower = language.trim().toLowerCase()
  if (lower === '') return null
  const canonical = LANGUAGE_ALIASES[lower] ?? lower
  return canonical in LANGUAGE_LOADERS ? canonical : null
}

type Highlighter = {
  codeToHtml: (code: string, options: { lang: string; theme: string }) => string
  loadLanguage: (lang: unknown) => Promise<void>
}

let highlighterPromise: Promise<Highlighter> | null = null
const languagePromises = new Map<string, Promise<void>>()

function getHighlighter(): Promise<Highlighter> {
  if (highlighterPromise === null) {
    highlighterPromise = (async () => {
      const [coreModule, engineModule, themeModule] = await Promise.all([
        import('shiki/core'),
        import('shiki/engine/javascript'),
        import('@shikijs/themes/catppuccin-mocha'),
      ])
      return coreModule.createHighlighterCore({
        themes: [themeModule.default],
        langs: [],
        engine: engineModule.createJavaScriptRegexEngine(),
      }) as unknown as Highlighter
    })()
  }
  return highlighterPromise
}

async function ensureLanguage(highlighter: Highlighter, language: string): Promise<void> {
  let pending = languagePromises.get(language)
  if (pending === undefined) {
    const loader = LANGUAGE_LOADERS[language]
    if (loader === undefined) throw new Error(`unsupported language: ${language}`)
    pending = loader().then((mod) => highlighter.loadLanguage(mod))
    languagePromises.set(language, pending)
  }
  await pending
}

const INNER_CODE_RE = /<code[^>]*>([\s\S]*)<\/code>/u

function extractInnerCode(html: string): string | null {
  const match = INNER_CODE_RE.exec(html)
  return match === null ? null : (match[1] ?? null)
}

/**
 * The highlighted markup for a block of code, ready to go inside a `<code>`
 * element. Rejects when the language has no grammar, which is the caller's cue
 * to render the code as plain text.
 */
export async function highlightToInnerHtml(code: string, language: string): Promise<string> {
  const canonical = resolveLanguage(language)
  if (canonical === null) throw new Error(`unsupported language: ${language}`)
  const highlighter = await getHighlighter()
  await ensureLanguage(highlighter, canonical)
  const inner = extractInnerCode(
    highlighter.codeToHtml(code, { lang: canonical, theme: CODE_THEME }),
  )
  if (inner === null) throw new Error('highlighter produced no code element')
  return inner
}

/**
 * One highlighted `<span class="line">…</span>` per input line, so a caller can
 * put each line in its own row — which is what a side-by-side or gutter-marked
 * diff needs.
 *
 * Shiki separates its line spans with a literal newline and never emits one
 * inside a line, so splitting the inner markup on `\n` is a faithful inverse of
 * splitting the source. Returns `null` when the language has no grammar or the
 * line counts disagree, so the caller falls back to plain text rather than
 * misaligning code with its gutter.
 */
export async function highlightLines(
  code: string,
  language: string,
): Promise<readonly string[] | null> {
  const canonical = resolveLanguage(language)
  if (canonical === null) return null
  try {
    const inner = await highlightToInnerHtml(code, canonical)
    const lines = inner.split('\n')
    return lines.length === code.split('\n').length ? lines : null
  } catch {
    return null
  }
}
