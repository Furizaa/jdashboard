import { useEffect, useRef } from 'react'
import { cn } from '~/lib/cn'
import { testIds } from '~/lib/testids'
import type { PaletteRow, PaletteSectionView } from '../view-model'

export function PaletteResults({
  sections,
  selected,
  onHighlight,
  onChoose,
}: {
  sections: readonly PaletteSectionView[]
  selected: number
  onHighlight: (index: number) => void
  onChoose: (row: PaletteRow) => void
}) {
  return (
    <div role="listbox" aria-label="Results">
      {sections.map((section) => (
        <div key={section.section}>
          <div
            data-testid={testIds.commandPaletteSection}
            className="text-ink-tertiary px-4 pt-2 pb-1 text-[10px] font-semibold tracking-wider uppercase"
          >
            {section.label}
          </div>
          {section.rows.map((row) => (
            <ResultRow
              key={row.id}
              row={row}
              active={row.index === selected}
              onHighlight={onHighlight}
              onChoose={onChoose}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function ResultRow({
  row,
  active,
  onHighlight,
  onChoose,
}: {
  row: PaletteRow
  active: boolean
  onHighlight: (index: number) => void
  onChoose: (row: PaletteRow) => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Keep the keyboard highlight inside the scroll viewport. The rows never take
  // DOM focus — the query input keeps it so typing keeps working — so the
  // browser will not scroll them into view on its own.
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      data-testid={testIds.commandPaletteRow}
      data-row-id={row.id}
      data-row-kind={row.target.kind}
      data-active={active ? 'true' : undefined}
      onMouseMove={() => !active && onHighlight(row.index)}
      onClick={() => onChoose(row)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onChoose(row)
      }}
      className={cn(
        'mx-1.5 flex cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm',
        active ? 'bg-surface-2 text-foreground' : 'text-ink-subtle',
      )}
    >
      {row.badge !== null && row.badge !== '' && (
        <span className="text-ink-tertiary shrink-0 font-mono text-[11px] tabular-nums">
          {row.badge}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{row.title}</span>
      {row.meta !== null && (
        <span className="text-ink-tertiary shrink-0 text-[11px]">{row.meta}</span>
      )}
    </div>
  )
}
