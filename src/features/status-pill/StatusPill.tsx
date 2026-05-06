import { StatusIcon } from './StatusIcon'
import { styleForStatus } from './status-color'

export function StatusPill({ status }: { status: string }) {
  const style = styleForStatus(status)
  return (
    <span className="border-border/60 bg-background/40 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap">
      <StatusIcon shape={style.shape} color={style.color} />
      <span style={{ color: style.label }}>{status}</span>
    </span>
  )
}
