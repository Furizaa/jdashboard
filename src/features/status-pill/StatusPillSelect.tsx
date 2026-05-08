import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { Check } from 'lucide-react'
import { cn } from '~/lib/cn'
import { useTransitionAction, useTransitions } from '~/dashboard'
import { StatusPill } from './StatusPill'
import { StatusIcon } from './StatusIcon'
import { styleForStatus } from './status-color'

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
  return (
    <ClickableStatusPill issueKey={issueKey} status={status} align={align} />
  )
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
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const transitions = useTransitions(issueKey, open)
  const mutation = useTransitionAction()

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [open])

  const handleTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    setOpen((v) => !v)
  }

  const handleSelect = (transitionId: string, toStatusName: string) => {
    setOpen(false)
    mutation.mutate({ key: issueKey, transitionId, toStatusName })
  }

  return (
    <div ref={wrapperRef} className="relative inline-block" onClick={stopBubble}>
      <button
        type="button"
        onClick={handleTriggerClick}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Change status from ${status}`}
        className="hover:bg-muted/40 focus-visible:ring-ring -mx-0.5 rounded-full transition-colors focus-visible:ring-1 focus-visible:outline-none"
      >
        <StatusPill status={status} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'border-border bg-popover absolute top-full z-30 mt-1 min-w-45 overflow-hidden rounded-md border py-1 text-xs shadow-lg',
            align === 'end' ? 'right-0' : 'left-0',
          )}
        >
          <DropdownContents
            currentStatus={status}
            isPending={transitions.isPending}
            isError={transitions.isError}
            data={transitions.data}
            onSelect={handleSelect}
          />
        </div>
      )}
    </div>
  )
}

function DropdownContents({
  currentStatus,
  isPending,
  isError,
  data,
  onSelect,
}: {
  currentStatus: string
  isPending: boolean
  isError: boolean
  data: ReturnType<typeof useTransitions>['data']
  onSelect: (transitionId: string, toStatusName: string) => void
}) {
  if (isPending) {
    return <DropdownMessage>Loading transitions…</DropdownMessage>
  }
  if (isError) {
    return <DropdownMessage>Couldn't load transitions</DropdownMessage>
  }
  if (!data?.ok) {
    return (
      <DropdownMessage>
        {data?.reason === 'unauthorized' ? 'Invalid Jira credentials' : "Couldn't load transitions"}
      </DropdownMessage>
    )
  }
  if (data.transitions.length === 0) {
    return <DropdownMessage>No transitions available</DropdownMessage>
  }
  const currentLower = currentStatus.toLowerCase()
  return (
    <ul>
      {data.transitions.map((t) => {
        const isCurrent = t.toStatusName.toLowerCase() === currentLower
        const style = styleForStatus(t.toStatusName)
        return (
          <li key={t.id}>
            <button
              type="button"
              role="menuitem"
              disabled={isCurrent}
              onClick={() => {
                if (!isCurrent) onSelect(t.id, t.toStatusName)
              }}
              className="hover:bg-muted/60 flex w-full items-center gap-2 px-2.5 py-1.5 text-left disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
            >
              <StatusIcon shape={style.shape} color={style.color} />
              <span className="text-foreground flex-1 truncate">{t.toStatusName}</span>
              {isCurrent && <Check size={12} className="text-muted-foreground" />}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function DropdownMessage({ children }: { children: React.ReactNode }) {
  return <div className="text-muted-foreground px-2.5 py-1.5">{children}</div>
}
