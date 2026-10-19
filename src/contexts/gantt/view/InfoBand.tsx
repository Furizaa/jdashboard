import { useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { match } from 'ts-pattern'
import { Maximize2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/design-system'
import type { GanttNodeView } from '~/kernel'
import { testIds } from '~/lib/testids'
import { useGanttNodeBody } from '../presenter'

// A lane's attached document, opened **inline, under the lane** (ADR-0012 §10).
//
// A side panel was rejected for the body: it covers the right third of the time
// axis, which is the future, which is the part being looked at. Inline also
// keeps two PRDs comparable in one scroll context, which is the thing the
// architect came to do.
//
// The band is **height-capped with its own scrollbar**, and the cap is a fixed
// height rather than a `max-height` for a reason beyond taste: `GanttArrows`
// computes where a row sits by counting the rows above it, so a band that grew
// with its content would mean measuring the DOM to place an arrow. The escape
// from the cap is the full view, not a taller band — the band is already as
// wide as the surface, so what it is short of is height.

/**
 * The band's **total** outer height, borders included. `GanttArrows` counts an
 * open band into its row offsets, so this is the number both sides agree on —
 * which is why the band is laid out as a fixed box with a scrolling body rather
 * than as a header plus a capped body that together come to whatever they come
 * to.
 */
export const INFO_BAND_HEIGHT = 260

// react-markdown does not render raw HTML by default, so an agent-written body
// is safe to render as-is; `remark-gfm` adds tables, task lists, strikethrough
// and autolinks. The prose classes are this context's own rather than Detail's
// or Explain's — reaching into another context for a style sheet is exactly what
// the no-cross-context law forbids, and a PRD is wider-set than either.
const PROSE = [
  'text-foreground/90 text-[13px] leading-relaxed break-words',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_h1]:mt-4 [&_h1]:mb-2 [&_h1]:text-sm [&_h1]:font-semibold [&_h1]:tracking-[-0.01em]',
  '[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:text-[13px] [&_h2]:font-semibold',
  '[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-xs [&_h3]:font-semibold [&_h3]:text-ink-subtle',
  '[&_p]:my-2',
  '[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_li]:my-1 [&_li>ul]:my-1 [&_li>ol]:my-1',
  '[&_input]:mr-1.5 [&_input]:align-middle [&_li:has(input)]:list-none [&_li:has(input)]:-ml-4',
  '[&_code]:bg-surface-2 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
  '[&_pre]:my-2.5 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-border [&_pre]:bg-surface-2 [&_pre]:p-2.5',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-[0.85em]',
  '[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-ink-subtle',
  '[&_hr]:my-4 [&_hr]:border-border',
  '[&_strong]:font-semibold [&_strong]:text-foreground [&_em]:italic',
  '[&_table]:my-2.5 [&_table]:block [&_table]:w-fit [&_table]:max-w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-xs',
  '[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold',
  '[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1',
].join(' ')

function GanttMarkdown({ markdown }: { markdown: string }) {
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
        {markdown}
      </Markdown>
    </div>
  )
}

export function InfoBand({
  chartId,
  node,
  depth,
}: {
  chartId: string
  node: GanttNodeView
  depth: number
}) {
  const body = useGanttNodeBody(chartId, node.id, true)
  const [full, setFull] = useState(false)
  const markdown = body.phase === 'ready' ? body.markdown : null

  return (
    <div
      data-testid={testIds.ganttInfoBand}
      data-node-id={node.id}
      className="border-border/60 bg-surface-1 flex flex-col border-b"
      // Aligned with the lane it belongs to, so a band under a depth-2 feature
      // reads as that feature's rather than as the chart's.
      style={{ height: INFO_BAND_HEIGHT, paddingLeft: 16 + depth * 14 }}
    >
      <div className="flex shrink-0 items-center gap-2 py-1.5 pr-3">
        <span className="text-ink-subtle text-[10px] font-medium tracking-[0.04em] uppercase">
          {node.title}
        </span>
        <button
          type="button"
          onClick={() => setFull(true)}
          disabled={markdown === null}
          aria-label={`Read the whole document on ${node.title}`}
          title="Open full"
          className="text-ink-tertiary hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring ml-auto inline-flex h-5 w-5 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
        >
          <Maximize2 size={11} aria-hidden />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-3 pb-3">
        <BandBody body={body} />
      </div>
      {markdown !== null && (
        <Dialog open={full} onOpenChange={setFull}>
          <DialogContent className="h-[82vh] max-w-4xl grid-rows-[auto_minmax(0,1fr)] sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>{node.title}</DialogTitle>
              <DialogDescription>
                {node.source.kind === 'jira' ? node.source.key : 'Owned by this chart'}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-y-auto pr-2">
              <GanttMarkdown markdown={markdown} />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function BandBody({ body }: { body: ReturnType<typeof useGanttNodeBody> }) {
  return match(body)
    .with({ phase: 'loading' }, () => <BandMessage>Reading…</BandMessage>)
    .with({ phase: 'empty' }, () => <BandMessage>This lane has no document.</BandMessage>)
    .with({ phase: 'error' }, () => <BandMessage>That document could not be read.</BandMessage>)
    .with({ phase: 'ready' }, ({ markdown }) => <GanttMarkdown markdown={markdown} />)
    .exhaustive()
}

function BandMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-tertiary text-xs">{children}</p>
}
