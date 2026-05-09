import { match } from 'ts-pattern'
import { Check } from 'lucide-react'
import { type MouseEvent } from 'react'
import { cn } from '~/lib/cn'
import { useStatusPillSelect } from '../presenter'
import type { DropdownState, TransitionItem } from '../view-model'
import { StatusPill } from './StatusPill'
import { StatusIcon } from './StatusIcon'

function stopBubble(event: MouseEvent) {
  event.stopPropagation()
}

export function StatusPillSelect({
  issueKey,
  status,
  align = 'start',
  clickable = true,
}: {
  issueKey: string
  status: string
  align?: 'start' | 'end'
  clickable?: boolean
}) {
  if (!clickable) {
    return <StatusPill status={status} />
  }
  return <ClickableStatusPill issueKey={issueKey} status={status} align={align} />
}

function ClickableStatusPill({
  issueKey,
  status,
  align,
}: {
  issueKey: string
  status: string
  align: 'start' | 'end'
}) {
  const { display, triggerRef, toggle, selectTransition } = useStatusPillSelect(issueKey, status)

  const handleTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    toggle()
  }

  return (
    // wrapper stops propagation to ticket-card click handlers; not itself actionable
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <div ref={triggerRef} className="relative inline-block" onClick={stopBubble}>
      <button
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={display.open}
        aria-label={`Change status from ${status}`}
        className="hover:bg-muted/40 focus-visible:ring-ring -mx-0.5 rounded-full transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <StatusPill status={status} />
      </button>
      {display.open && (
        <div
          role="menu"
          className={cn(
            'border-border bg-popover absolute top-full z-30 mt-1 min-w-45 overflow-hidden rounded-md border py-1 text-xs shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <DropdownContents dropdown={display.dropdown} onSelect={selectTransition} />
        </div>
      )}
    </div>
  )
}

function DropdownContents({
  dropdown,
  onSelect,
}: {
  dropdown: DropdownState
  onSelect: (transitionId: string, toStatusName: string) => void
}) {
  return match(dropdown)
    .with({ kind: 'loading' }, () => <DropdownMessage>Loading transitions…</DropdownMessage>)
    .with({ kind: 'error-network' }, () => (
      <DropdownMessage>Couldn&apos;t load transitions</DropdownMessage>
    ))
    .with({ kind: 'error-unauthorized' }, () => (
      <DropdownMessage>Invalid Jira credentials</DropdownMessage>
    ))
    .with({ kind: 'no-transitions' }, () => (
      <DropdownMessage>No transitions available</DropdownMessage>
    ))
    .with({ kind: 'available' }, ({ items }) => (
      <ul>
        {items.map((item) => (
          <TransitionRow key={item.id} item={item} onSelect={onSelect} />
        ))}
      </ul>
    ))
    .exhaustive()
}

function TransitionRow({
  item,
  onSelect,
}: {
  item: TransitionItem
  onSelect: (transitionId: string, toStatusName: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        role="menuitem"
        disabled={item.isCurrent}
        onClick={() => {
          if (!item.isCurrent) onSelect(item.id, item.toStatusName)
        }}
        className="hover:bg-muted/60 flex w-full items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <StatusIcon shape={item.style.shape} color={item.style.color} />
        <span className="text-foreground flex-1 truncate">{item.displayName}</span>
        {item.isCurrent && <Check size={12} className="text-muted-foreground" />}
      </button>
    </li>
  )
}

function DropdownMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground px-2.5 py-1.5">{children}</div>
}
