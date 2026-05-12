import { StatusIcon } from './StatusIcon'
import { styleForStatus } from '../domain/status-color'
import { displayNameForStatus } from '../domain/status-display-name'

export function StatusPill({ status }: { status: string }) {
  const style = styleForStatus(status)
  return (
    <span className="border-border bg-surface-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap">
      <StatusIcon shape={style.shape} color={style.color} />
      <span style={{ color: style.label }}>{displayNameForStatus(status)}</span>
    </span>
  )
}
