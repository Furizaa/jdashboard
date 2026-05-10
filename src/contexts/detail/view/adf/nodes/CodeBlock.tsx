import { lazy, Suspense, type ReactNode } from 'react'
import type { AdfNode } from '~/kernel'
import { normalizeCodeLanguage } from '../../../domain'
import { PlainCodeBlock } from './PlainCodeBlock'

const HighlightedCode = lazy(() => import('./HighlightedCode'))

export function CodeBlock({ node, children }: { node: AdfNode; children: ReactNode }) {
  const rawLanguage = typeof node.attrs?.language === 'string' ? node.attrs.language : null
  const language = normalizeCodeLanguage(rawLanguage)

  if (language === null) {
    return <PlainCodeBlock>{children}</PlainCodeBlock>
  }

  return (
    <Suspense fallback={<PlainCodeBlock>{children}</PlainCodeBlock>}>
      <HighlightedCode language={language} code={extractText(node)} />
    </Suspense>
  )
}

function extractText(node: AdfNode): string {
  if (typeof node.text === 'string') return node.text
  if (!Array.isArray(node.content)) return ''
  return node.content.map(extractText).join('')
}
