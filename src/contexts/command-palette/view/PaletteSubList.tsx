import { useEffect, useRef } from 'react'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import { match } from 'ts-pattern'
import type { PaletteSubItemRow, PaletteSubListContent } from '../view-model'

export function PaletteSubList({
  content,
  subIndex,
  emptyMessage,
  onHighlight,
  onRun,
}: {
  content: PaletteSubListContent
  subIndex: number
  emptyMessage: string
  onHighlight: (index: number) => void
  onRun: (row: PaletteSubItemRow) => void
}) {
  return (
    match(content)
      .with({ state: 'loading' }, () => (
        <div
          data-testid={testIds.commandPaletteSubLoading}
          className="text-ink-tertiary flex items-center justify-center gap-2 px-4 py-10 text-xs"
        >
          <Loader2 size={13} className="animate-spin" aria-hidden />
          <span>Loading…</span>
        </div>
      ))
      // Visibly different from an empty list: a broken request and "this ticket
      // has nowhere to go" are not the same answer.
      .with({ state: 'failed' }, ({ message }) => (
        <div
          data-testid={testIds.commandPaletteSubFailed}
          className="text-destructive flex items-start justify-center gap-2 px-4 py-10 text-center text-xs"
        >
          <AlertCircle size={13} className="mt-px shrink-0" aria-hidden />
          <span>{message}</span>
        </div>
      ))
      .with({ state: 'ready' }, ({ rows }) =>
        rows.length === 0 ? (
          <div
            data-testid={testIds.commandPaletteSubEmpty}
            className="text-ink-tertiary px-4 py-10 text-center text-xs"
          >
            {emptyMessage}
          </div>
        ) : (
          <div role="listbox" aria-label="Choices">
            {rows.map((row) => (
              <SubRow
                key={row.id}
                row={row}
                active={row.index === subIndex}
                onHighlight={onHighlight}
                onRun={onRun}
              />
            ))}
          </div>
        ),
      )
      .exhaustive()
  )
}

function SubRow({
  row,
  active,
  onHighlight,
  onRun,
}: {
  row: PaletteSubItemRow
  active: boolean
  onHighlight: (index: number) => void
  onRun: (row: PaletteSubItemRow) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      aria-checked={row.checked}
      tabIndex={-1}
      data-testid={testIds.commandPaletteSubItem}
      data-sub-id={row.id}
      data-checked={row.checked === true ? 'true' : undefined}
      data-active={active ? 'true' : undefined}
      onMouseMove={() => !active && onHighlight(row.index)}
      onClick={() => onRun(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onRun(row)
      }}
      className={cn(
        'mx-1.5 flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
        active ? 'bg-surface-2 text-foreground' : 'text-ink-subtle',
      )}
    >
      {row.swatch === undefined ? (
        <span className="min-w-0 flex-1 truncate">{row.label}</span>
      ) : (
        <span className="min-w-0 flex-1">
          {/* Rendered in the tag's own colour so the row matches the chip on the
              card and in the detail panel. */}
          <span
            className="inline-flex h-4 max-w-full items-center truncate rounded px-1.5 text-[11px] leading-none font-medium"
            style={{ backgroundColor: row.swatch.bg, color: row.swatch.fg }}
          >
            {row.label}
          </span>
        </span>
      )}
      {row.checked === true && <Check size={13} className="shrink-0" aria-hidden />}
      {row.digit !== null && (
        <kbd className="bg-surface-2 border-border text-ink-tertiary inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none">
          {row.digit}
        </kbd>
      )}
    </div>
  )
}
