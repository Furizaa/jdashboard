import { useEffect, useId, useState } from 'react'
import { Maximize2, Workflow } from 'lucide-react'
import type { ExplainBlockOf } from '~/kernel'
import { testIds } from '~/lib/testids'
import { BlockShell } from './BlockShell'
import { DiagramOverlay } from './DiagramOverlay'

// A diagram, for the changes that are structural: a new call path, a changed
// dependency direction, a new sequence between services. Something to see rather
// than reconstruct.
//
// Mermaid is `import()`-ed **per diagram block**, so a report without one pays
// nothing — the same lazy-loading discipline the shiki grammars follow, and the
// reason a ~1MB dependency is acceptable here at all.
//
// The diagram source is untrusted agent output, so mermaid runs with
// `securityLevel: 'strict'` (ADR-0009 §8): HTML labels off, click handlers
// disabled, and the SVG sanitised before it is returned.
//
// Inline, the diagram is a **thumbnail**: mermaid scales it down to the report
// column, which for anything structural enough to be worth drawing is too small
// to read. So it is also a button — it opens `DiagramOverlay`, which is where it
// is read, panned and zoomed.

type Mermaid = {
  initialize: (config: Record<string, unknown>) => void
  parse: (
    text: string,
    options: { suppressErrors: true },
  ) => Promise<false | { diagramType: string }>
  render: (id: string, text: string) => Promise<{ svg: string }>
}

/**
 * Catppuccin Mocha, so a diagram reads as part of the app rather than as a
 * pasted-in picture. `theme: 'base'` is the only theme whose variables are fully
 * overridable, which is why it is the one we start from.
 */
const THEME_VARIABLES: Readonly<Record<string, string>> = {
  darkMode: 'true',
  background: '#141516',
  primaryColor: '#181920',
  primaryTextColor: '#f7f8f8',
  primaryBorderColor: '#5e6ad2',
  secondaryColor: '#18191a',
  secondaryTextColor: '#d0d6e0',
  secondaryBorderColor: '#34343a',
  tertiaryColor: '#191a1b',
  tertiaryTextColor: '#8a8f98',
  tertiaryBorderColor: '#23252a',
  lineColor: '#8a8f98',
  textColor: '#f7f8f8',
  mainBkg: '#181920',
  nodeBorder: '#5e6ad2',
  clusterBkg: '#0f1011',
  clusterBorder: '#23252a',
  edgeLabelBackground: '#141516',
  labelBoxBkgColor: '#181920',
  labelBoxBorderColor: '#34343a',
  labelTextColor: '#f7f8f8',
  actorBkg: '#181920',
  actorBorder: '#5e6ad2',
  actorTextColor: '#f7f8f8',
  activationBkgColor: '#18191a',
  signalColor: '#d0d6e0',
  signalTextColor: '#f7f8f8',
  noteBkgColor: '#18191a',
  noteBorderColor: '#34343a',
  noteTextColor: '#d0d6e0',
  fontFamily: 'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
  fontSize: '12px',
}

// One module-scoped promise: the import and the one-time `initialize` are shared
// by every diagram on the page, however many blocks ask for them.
let mermaidPromise: Promise<Mermaid> | null = null

function loadMermaid(): Promise<Mermaid> {
  if (mermaidPromise === null) {
    mermaidPromise = import('mermaid').then((module) => {
      const mermaid = module.default as unknown as Mermaid
      mermaid.initialize({
        startOnLoad: false,
        // Untrusted input: no HTML labels, no click handlers, sanitised output.
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: THEME_VARIABLES,
        flowchart: { curve: 'basis', padding: 12 },
        // A diagram the agent wrote badly should fail to a message, not to a
        // console full of mermaid's own logging.
        logLevel: 'fatal',
      })
      return mermaid
    })
  }
  return mermaidPromise
}

type DiagramState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly svg: string }
  | { readonly status: 'failed' }

export function DiagramBlock({ block }: { block: ExplainBlockOf<'diagram'> }) {
  const reactId = useId()
  // Mermaid uses the id to key a temporary DOM node, and rejects `:` in it.
  const renderId = `explain-diagram-${reactId.replaceAll(/[^a-zA-Z0-9-]/gu, '')}`
  const state = useMermaidSvg(block.mermaid, renderId)
  const [expanded, setExpanded] = useState(false)
  const title = block.title ?? 'Structure'

  return (
    <BlockShell
      kind="diagram"
      title={title}
      icon={<Workflow size={12} className="text-ink-tertiary" aria-hidden />}
      action={
        state.status === 'ready' ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            data-testid={testIds.explainDiagramExpand}
            aria-label={`Expand diagram: ${title}`}
            title="Expand — drag to pan, scroll to zoom"
            className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[11px] transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <Maximize2 size={11} aria-hidden />
            <span>Expand</span>
          </button>
        ) : undefined
      }
    >
      {state.status === 'failed' ? (
        // The source is shown rather than swallowed: a diagram that will not
        // render is still information, and it is also the only way to see what
        // the agent actually wrote.
        <div className="flex flex-col gap-2">
          <p className="text-ink-subtle text-xs">
            This diagram could not be drawn. Its source is below.
          </p>
          <pre className="border-border bg-surface-2 overflow-x-auto rounded-md border p-2.5 font-mono text-[11px] leading-relaxed">
            <code>{block.mermaid}</code>
          </pre>
        </div>
      ) : (
        <div
          data-testid={testIds.explainDiagram}
          data-status={state.status}
          className="flex justify-center overflow-x-auto [&_svg]:h-auto [&_svg]:max-w-full"
        >
          {state.status === 'loading' ? (
            <span className="text-ink-tertiary py-6 text-xs">Drawing…</span>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-label={`Expand diagram: ${title}`}
              className="focus-visible:ring-ring cursor-zoom-in rounded focus-visible:ring-2 focus-visible:outline-none"
            >
              {/* Sanitised by mermaid under `securityLevel: 'strict'`. */}
              <span dangerouslySetInnerHTML={{ __html: state.svg }} />
            </button>
          )}
        </div>
      )}
      {block.caption !== undefined && (
        <p className="text-ink-subtle mt-2 text-center text-xs leading-relaxed">{block.caption}</p>
      )}
      {expanded && state.status === 'ready' && (
        <DiagramOverlay
          title={title}
          caption={block.caption}
          svg={state.svg}
          onClose={() => setExpanded(false)}
        />
      )}
    </BlockShell>
  )
}

function useMermaidSvg(source: string, renderId: string): DiagramState {
  const [state, setState] = useState<DiagramState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadMermaid()
      .then(async (mermaid) => {
        // Validate first: `parse` with suppressed errors tells us the source is
        // unusable without `render` throwing from inside the DOM it just built.
        const parsed = await mermaid.parse(source, { suppressErrors: true })
        if (parsed === false) throw new Error('invalid mermaid source')
        return mermaid.render(renderId, source)
      })
      .then(({ svg }) => {
        if (!cancelled) setState({ status: 'ready', svg })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [source, renderId])

  return state
}
