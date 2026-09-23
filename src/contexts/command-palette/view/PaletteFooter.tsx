import { AlertCircle, Loader2 } from 'lucide-react'
import { testIds } from '~/lib/testids'
import type { PaletteSourceNote } from '../domain'

/**
 * The hint strip along the bottom: what the keyboard does here, and an honest
 * note when a source has not arrived or cannot be reached. Later slices fill it
 * out with the per-level shortcut hints.
 */
export function PaletteFooter({ sources }: { sources: readonly PaletteSourceNote[] }) {
  const loading = sources.filter((s) => s.state === 'loading')
  const unavailable = sources.filter((s) => s.state === 'unavailable')

  return (
    <div
      data-testid={testIds.commandPaletteFooter}
      className="border-border bg-surface-1 text-ink-tertiary flex h-9 shrink-0 items-center gap-3 border-t px-4 text-[11px]"
    >
      <Hint keys={['↑', '↓']}>Navigate</Hint>
      <Hint keys={['↵']}>Open</Hint>
      <Hint keys={['esc']}>Close</Hint>
      <span className="ml-auto flex items-center gap-3">
        {loading.length > 0 && (
          <span className="flex items-center gap-1.5">
            <Loader2 size={11} className="animate-spin" aria-hidden />
            {sourceList(loading)} still loading
          </span>
        )}
        {unavailable.length > 0 && (
          <span className="text-destructive flex items-center gap-1.5">
            <AlertCircle size={11} aria-hidden />
            {sourceList(unavailable)} unavailable
          </span>
        )}
      </span>
    </div>
  )
}

export function sourceList(sources: readonly PaletteSourceNote[]): string {
  return sources.map((s) => s.source).join(' and ')
}

function Hint({ keys, children }: { keys: readonly string[]; children: string }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          key={key}
          className="bg-surface-2 border-border inline-flex h-4 min-w-4 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none"
        >
          {key}
        </kbd>
      ))}
      <span>{children}</span>
    </span>
  )
}
