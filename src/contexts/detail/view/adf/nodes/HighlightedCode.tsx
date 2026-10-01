import { useEffect, useState } from 'react'
import { highlightToInnerHtml } from '~/design-system/code-highlight'
import { CODE_BLOCK_PRE_CLASS, PlainCodeBlock } from './PlainCodeBlock'

// The highlighter singleton, the theme, and the per-language grammar loaders
// moved to `~/design-system/code-highlight` when Explain's finding blocks became
// their second consumer (adopt-on-second-use). What is left here is the ADF code
// block's own concern: render the markup, and fall back to plain text when the
// language has no grammar.

export default function HighlightedCode({ language, code }: { language: string; code: string }) {
  const [innerHtml, setInnerHtml] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    highlightToInnerHtml(code, language)
      .then((inner) => {
        if (cancelled) return
        setInnerHtml(inner)
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
