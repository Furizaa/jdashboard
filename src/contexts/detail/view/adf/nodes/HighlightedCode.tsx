import { useEffect, useState } from 'react'
import { CODE_BLOCK_PRE_CLASS, PlainCodeBlock } from './PlainCodeBlock'

const THEME_NAME = 'catppuccin-mocha'

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

async function highlight(code: string, language: string): Promise<string> {
  const highlighter = await getHighlighter()
  await ensureLanguage(highlighter, language)
  return highlighter.codeToHtml(code, { lang: language, theme: THEME_NAME })
}

const INNER_CODE_RE = /<code[^>]*>([\s\S]*)<\/code>/u

function extractInnerCode(html: string): string | null {
  const match = INNER_CODE_RE.exec(html)
  return match === null ? null : (match[1] ?? null)
}

export default function HighlightedCode({ language, code }: { language: string; code: string }) {
  const [innerHtml, setInnerHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    highlight(code, language)
      .then((html) => {
        if (cancelled) return
        const inner = extractInnerCode(html)
        if (inner === null) setFailed(true)
        else setInnerHtml(inner)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [code, language])

  if (failed) return <PlainCodeBlock>{code}</PlainCodeBlock>

  return (
    <pre className={CODE_BLOCK_PRE_CLASS}>
      {innerHtml === null ? (
        <code>{code}</code>
      ) : (
        <code dangerouslySetInnerHTML={{ __html: innerHtml }} />
      )}
    </pre>
  )
}
