import { useEffect, useRef } from 'react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { PaletteActionGroupView, PaletteActionRow } from '../view-model'

export function PaletteActions({
  groups,
  actionIndex,
  onHighlight,
  onRun,
}: {
  groups: readonly PaletteActionGroupView[]
  actionIndex: number
  onHighlight: (index: number) => void
  onRun: (row: PaletteActionRow) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="text-ink-tertiary px-4 py-10 text-center text-xs">
        No actions available for this item.
      </div>
    )
  }
  return (
    <div role="listbox" aria-label="Actions">
      {groups.map((group) => (
        <div key={group.group}>
          <div
            data-testid={testIds.commandPaletteSection}
            className="text-ink-tertiary px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
          >
            {group.label}
          </div>
          {group.rows.map((row) => (
            <ActionRow
              key={row.kind}
              row={row}
              active={row.index === actionIndex}
              onHighlight={onHighlight}
              onRun={onRun}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ActionRow({
  row,
  active,
  onHighlight,
  onRun,
}: {
  row: PaletteActionRow
  active: boolean
  onHighlight: (index: number) => void
  onRun: (row: PaletteActionRow) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Same reason as the result rows: the highlight never takes DOM focus (the
  // query input keeps it), so nothing scrolls it into view by itself.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      aria-disabled={!row.enabled}
      tabIndex={-1}
      data-testid={testIds.commandPaletteAction}
      data-action-kind={row.kind}
      data-active={active ? 'true' : undefined}
      onMouseMove={() => !active && onHighlight(row.index)}
      onClick={() => onRun(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onRun(row)
      }}
      className={cn(
        'mx-1.5 flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
        active ? 'bg-surface-2 text-foreground' : 'text-ink-subtle',
        !row.enabled && 'opacity-50',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{row.label}</span>
      <kbd className="bg-surface-2 border-border text-ink-tertiary inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded border px-1 font-mono text-[10px] leading-none">
        {row.shortcut}
      </kbd>
    </div>
  )
}
