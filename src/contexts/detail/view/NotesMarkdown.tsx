import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Read-mode rendering of a ticket note. react-markdown does not render raw HTML by
// default, so the note is safe to render as-is; `remark-gfm` adds task lists,
// tables, strikethrough, and autolinks. Block-level styling is done with
// descendant variants on the wrapper (no typography plugin in the repo); the one
// element that needs behaviour, not just style, is the link — forced to a new tab
// so following it never navigates the dashboard away.
const PROSE = [
  'text-foreground text-sm leading-relaxed break-words',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-5 [&_h1]:mb-2 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:tracking-[-0.01em]',
  '[&_h2]:mt-4 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold',
  '[&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold',
  '[&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-sm [&_h4]:font-semibold [&_h4]:text-ink-subtle',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1 [&_li>ul]:my-1 [&_li>ol]:my-1',
  '[&_input]:mr-1.5 [&_input]:align-middle [&_li:has(input)]:list-none [&_li:has(input)]:-ml-4',
  '[&_code]:bg-surface-2 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-1 [&_pre]:p-3',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.85em]',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-subtle',
  '[&_hr]:my-5 [&_hr]:border-border',
  '[&_strong]:font-semibold [&_em]:italic',
  '[&_table]:my-3 [&_table]:block [&_table]:w-fit [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
].join(' ')

export function NotesMarkdown({ content }: { content: string }) {
  return (
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
        {content}
      </Markdown>
    </div>
  )
}
