import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ExplainBlockOf } from '~/kernel'
import { BlockShell } from './BlockShell'

// The report's prose, at the level of systems rather than lines.
//
// react-markdown does not render raw HTML by default, so agent-written markdown
// is safe to render as-is; `remark-gfm` adds tables, strikethrough, and
// autolinks. The prose classes are this context's own rather than Detail's
// `NotesMarkdown` — a report is denser than a note, and reaching into another
// context for a style sheet is exactly what the no-cross-context law forbids.
const PROSE = [
  'text-foreground/90 text-[13px] leading-relaxed break-words',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-4 [&_h1]:mb-1.5 [&_h1]:text-sm [&_h1]:font-semibold',
  '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-[13px] [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-ink-subtle',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1',
  '[&_code]:bg-surface-2 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-2 [&_pre]:p-2.5',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.85em]',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-subtle',
  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
  '[&_table]:my-2.5 [&_table]:block [&_table]:w-fit [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
].join(' ')

export function NarrativeBlock({ block }: { block: ExplainBlockOf<'narrative'> }) {
  return (
    <BlockShell kind="narrative" title={block.title ?? 'What changed'}>
      <div className={PROSE}>
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="decoration-ink-tertiary underline underline-offset-2 hover:decoration-current"
              >
                {children}
              </a>
            ),
          }}
        >
          {block.body}
        </Markdown>
      </div>
    </BlockShell>
  )
}
