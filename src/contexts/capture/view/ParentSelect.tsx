import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { HARDCODED_PARENTS } from '../domain'
import { useMyEpics } from '../presenter'

const TRIGGER_CLASS =
  'border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs focus-visible:ring-1 focus-visible:outline-none'

const SECTION_LABEL_CLASS =
  'text-muted-foreground px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wide'

export function ParentSelect({
  value,
  onChange,
  open: modalOpen,
}: {
  value: string
  onChange: (key: string) => void
  open: boolean
}) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const epicsQuery = useMyEpics(modalOpen)

  useEffect(() => {
    if (!popoverOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(event.target as Node)) setPopoverOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setPopoverOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [popoverOpen])

  const dynamicEpics: ReadonlyArray<{ key: string; label: string }> =
    epicsQuery.data?.ok === true
      ? epicsQuery.data.epics.map((e) => ({ key: e.key, label: e.summary }))
      : []

  const selected =
    HARDCODED_PARENTS.find((p) => p.key === value) ??
    dynamicEpics.find((e) => e.key === value) ??
    null

  const choose = (key: string) => {
    onChange(key)
    setPopoverOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setPopoverOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={popoverOpen}
        className={TRIGGER_CLASS}
      >
        <span className={selected ? 'text-foreground' : 'text-muted-foreground'}>
          {selected ? `${selected.key} · ${selected.label}` : 'Select a parent…'}
        </span>
        <ChevronDown size={14} className="text-muted-foreground ml-2 shrink-0" />
      </button>
      {popoverOpen && (
        // styled popover listbox; native <select> does not support sectioned/custom-rendered options
        <div
          role="listbox"
          className="border-border bg-popover absolute top-full left-0 z-30 mt-1 w-full overflow-hidden rounded-md border py-1 text-xs shadow-lg"
        >
          <div className={SECTION_LABEL_CLASS}>Pinned</div>
          <ul>
            {HARDCODED_PARENTS.map((parent) => (
              <ParentRow
                key={parent.key}
                entryKey={parent.key}
                label={parent.label}
                selected={parent.key === value}
                onSelect={choose}
              />
            ))}
          </ul>

          <div className="border-border/50 my-1 border-t" />

          <div className={SECTION_LABEL_CLASS}>My in-progress epics</div>
          <DynamicSection
            isLoading={epicsQuery.isLoading}
            isError={epicsQuery.isError || epicsQuery.data?.ok === false}
            epics={dynamicEpics}
            selectedKey={value}
            onSelect={choose}
            onRetry={() => epicsQuery.refetch()}
          />
        </div>
      )}
    </div>
  )
}

function ParentRow({
  entryKey,
  label,
  selected,
  onSelect,
}: {
  entryKey: string
  label: string
  selected: boolean
  onSelect: (key: string) => void
}) {
  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => onSelect(entryKey)}
        className="hover:bg-muted/60 text-foreground flex w-full items-center gap-2 px-2.5 py-1.5 text-left"
      >
        <span className="text-muted-foreground font-mono">{entryKey}</span>
        <span>·</span>
        <span className="flex-1 truncate">{label}</span>
      </button>
    </li>
  )
}

function DynamicSection({
  isLoading,
  isError,
  epics,
  selectedKey,
  onSelect,
  onRetry,
}: {
  isLoading: boolean
  isError: boolean
  epics: ReadonlyArray<{ key: string; label: string }>
  selectedKey: string
  onSelect: (key: string) => void
  onRetry: () => void
}) {
  if (isLoading) {
    return (
      <div className="px-2.5 py-1.5" aria-hidden>
        <div className="skeleton-shimmer h-4 w-full rounded" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="text-muted-foreground px-2.5 py-1.5">
        Failed to load epics —{' '}
        <button
          type="button"
          onClick={onRetry}
          className="text-foreground focus-visible:ring-ring underline-offset-2 hover:underline focus-visible:ring-1 focus-visible:outline-none"
        >
          retry
        </button>
      </div>
    )
  }
  if (epics.length === 0) {
    return (
      <div className="text-muted-foreground px-2.5 py-1.5">No active epics assigned to you</div>
    )
  }
  return (
    <ul>
      {epics.map((epic) => (
        <ParentRow
          key={epic.key}
          entryKey={epic.key}
          label={epic.label}
          selected={epic.key === selectedKey}
          onSelect={onSelect}
        />
      ))}
    </ul>
  )
}
