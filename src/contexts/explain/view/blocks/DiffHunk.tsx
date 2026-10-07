import { useEffect, useState } from 'react'
import { highlightLines } from '~/design-system/code-highlight'
import { cn } from '~/lib/cn'

// A unified diff hunk, syntax-highlighted in the app's own Catppuccin theme, so
// a finding's claim can be checked without leaving the report (ADR-0009 §8).
//
// Highlighting is done on the *stripped* body — the diff markers removed — and
// then mapped back line by line, because that is what gives the grammar real
// code to read instead of lines that start with `+`. The `+`/`-` lives in the
// gutter, where it is also easier to read and impossible to copy by accident.

type DiffLineKind = 'added' | 'removed' | 'context' | 'hunk' | 'meta'

type DiffLine = {
  readonly kind: DiffLineKind
  /** The line without its diff marker (the whole line for `hunk` / `meta`). */
  readonly text: string
}

/** Lines whose content is code, and therefore gets highlighted. */
const CODE_KINDS: ReadonlySet<DiffLineKind> = new Set(['added', 'removed', 'context'])

export function parseUnifiedDiff(diff: string): readonly DiffLine[] {
  // A trailing newline is a line terminator, not an empty last line.
  const raw = diff.replace(/\n$/u, '').split('\n')
  return raw.map((line): DiffLine => {
    if (line.startsWith('@@')) return { kind: 'hunk', text: line }
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
      return { kind: 'meta', text: line }
    }
    if (line.startsWith('+')) return { kind: 'added', text: line.slice(1) }
    if (line.startsWith('-')) return { kind: 'removed', text: line.slice(1) }
    if (line.startsWith('\\')) return { kind: 'meta', text: line }
    // A context line normally starts with a space, but agents (and `git
    // diff --no-prefix` output pasted by hand) often drop it.
    return { kind: 'context', text: line.startsWith(' ') ? line.slice(1) : line }
  })
}

export function DiffHunk({
  path,
  diff,
  language,
}: {
  path: string
  diff: string
  language?: string | undefined
}) {
  const lines = parseUnifiedDiff(diff)
  const highlighted = useHighlightedDiff(lines, language)

  return (
    <figure className="border-border bg-surface-2 overflow-hidden rounded-md border">
      <figcaption className="border-border/70 text-ink-subtle truncate border-b px-2.5 py-1 font-mono text-[10px]">
        {path}
      </figcaption>
      <div className="overflow-x-auto">
        <pre className="leading-code font-mono text-[11px]">
          <code>
            {lines.map((line, index) => (
              // The index is the key because a hunk is immutable text: its lines
              // are never inserted, removed, or reordered.
              // oxlint-disable-next-line no-array-index-key -- see comment above
              <span key={index} data-kind={line.kind} className={rowClass(line.kind)}>
                <span
                  aria-hidden
                  className={cn(
                    'inline-block w-4 shrink-0 text-center select-none',
                    gutterClass(line.kind),
                  )}
                >
                  {markerFor(line.kind)}
                </span>
                {highlighted?.[index] === undefined ? (
                  <span>{line.text}</span>
                ) : (
                  <span dangerouslySetInnerHTML={{ __html: highlighted[index] }} />
                )}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  )
}

/**
 * Highlighted markup per line, or `null` while it loads and whenever the
 * language has no grammar — in which case the hunk renders as plain text, which
 * is the same fallback the ADF code block makes.
 */
function useHighlightedDiff(
  lines: readonly DiffLine[],
  language: string | undefined,
): readonly (string | undefined)[] | null {
  const [highlighted, setHighlighted] = useState<readonly (string | undefined)[] | null>(null)
  // The highlighter is keyed on the content, not the array identity, so a
  // re-render with an equal hunk does not re-highlight it.
  const body = lines
    .filter((line) => CODE_KINDS.has(line.kind))
    .map((line) => line.text)
    .join('\n')

  useEffect(() => {
    if (language === undefined || language === '' || body === '') {
      setHighlighted(null)
      return
    }
    let cancelled = false
    highlightLines(body, language)
      .then((result) => {
        if (cancelled || result === null) return
        // Map the highlighted code lines back onto their positions in the hunk,
        // skipping the `@@` and metadata rows the body left out.
        const byIndex: (string | undefined)[] = []
        let cursor = 0
        for (const line of lines) {
          byIndex.push(CODE_KINDS.has(line.kind) ? result[cursor++] : undefined)
        }
        setHighlighted(byIndex)
      })
      .catch(() => {
        // plain text is the fallback; nothing to report
      })
    return () => {
      cancelled = true
    }
    // `lines` is derived from the same text as `body`, so `body` is the honest
    // dependency; including the array would re-run on every render.
    // oxlint-disable-next-line exhaustive-deps -- see comment above
  }, [body, language])

  return highlighted
}

function rowClass(kind: DiffLineKind): string {
  return cn(
    'block w-full whitespace-pre px-1',
    kind === 'added' && 'bg-emerald-500/10',
    kind === 'removed' && 'bg-destructive/10',
    kind === 'hunk' && 'bg-surface-3 text-ink-tertiary',
    kind === 'meta' && 'text-ink-tertiary',
  )
}

function gutterClass(kind: DiffLineKind): string {
  return cn(
    kind === 'added' && 'text-emerald-400',
    kind === 'removed' && 'text-destructive',
    (kind === 'context' || kind === 'hunk' || kind === 'meta') && 'text-ink-tertiary',
  )
}

function markerFor(kind: DiffLineKind): string {
  switch (kind) {
    case 'added':
      return '+'
    case 'removed':
      return '−'
    default:
      return ''
  }
}
