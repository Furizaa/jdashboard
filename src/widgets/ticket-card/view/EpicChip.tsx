import { testIds } from '~/lib/testids'
import { colorForLabel } from '../domain/hash-color'

export function EpicChip({ epic }: { epic: { key: string; summary: string } }) {
  const color = colorForLabel(epic.key)
  return (
    <span
      data-testid={testIds.epicChip}
      title={`${epic.key} — ${epic.summary}`}
      className="inline-flex max-w-[140px] items-center gap-1 rounded-sm px-1.5 py-0.5 text-[10px] leading-none font-medium"
      style={{ backgroundColor: `${color}26`, color }}
    >
      <span className="truncate">{epic.summary}</span>
    </span>
  )
}
