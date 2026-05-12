import { useEffect, useRef, useState, type RefObject } from 'react'
import { ChevronDown } from 'lucide-react'
import { Skeleton } from '~/design-system'
import { HARDCODED_PARENTS } from '../domain'
import { useMyEpics } from '../presenter'

const TRIGGER_CLASS =
  'border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary hover:bg-surface-2 focus-visible:ring-ring focus:border-border-strong flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-[13px] transition-colors focus-visible:ring-2 focus-visible:outline-none'

const SECTION_LABEL_CLASS =
  'text-ink-tertiary px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-[0.06em] uppercase'

function useDismissOnOutside(
  active: boolean,
  dismiss: () => void,
  ref: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!active) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(event.target as Node)) dismiss()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        dismiss()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [active, dismiss, ref])
}

type ParentEntry = { key: string; label: string }

function dynamicEpicsFrom(data: ReturnType<typeof useMyEpics>['data']): ReadonlyArray<ParentEntry> {
  if (data?.ok !== true) return []
  return data.epics.map((e) => ({ key: e.key, label: e.summary }))
}

function findSelected(value: string, dynamicEpics: ReadonlyArray<ParentEntry>): ParentEntry | null {
  return (
    HARDCODED_PARENTS.find((p) => p.key === value) ??
    dynamicEpics.find((e) => e.key === value) ??
    null
  )
}

function ParentTrigger({
  popoverOpen,
  selected,
  toggle,
}: {
  popoverOpen: boolean
  selected: ParentEntry | null
  toggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-haspopup="listbox"
      aria-expanded={popoverOpen}
      className={TRIGGER_CLASS}
    >
      <span className={selected ? 'text-foreground' : 'text-ink-tertiary'}>
        {selected ? `${selected.key} · ${selected.label}` : 'Select a parent…'}
      </span>
      <ChevronDown size={14} className="text-ink-subtle ml-2 shrink-0" />
    </button>
  )
}

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

  useDismissOnOutside(popoverOpen, () => setPopoverOpen(false), wrapperRef)

  const dynamicEpics = dynamicEpicsFrom(epicsQuery.data)
  const selected = findSelected(value, dynamicEpics)
  const isError = epicsQuery.isError || epicsQuery.data?.ok === false

  const choose = (key: string) => {
    onChange(key)
    setPopoverOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <ParentTrigger
        popoverOpen={popoverOpen}
        selected={selected}
        toggle={() => setPopoverOpen((v) => !v)}
      />
      {popoverOpen && (
        <ParentPopover
          value={value}
          dynamicEpics={dynamicEpics}
          isLoading={epicsQuery.isLoading}
          isError={isError}
          onSelect={choose}
          onRetry={() => epicsQuery.refetch()}
        />
      )}
    </div>
  )
}

function ParentPopover({
  value,
  dynamicEpics,
  isLoading,
  isError,
  onSelect,
  onRetry,
}: {
  value: string
  dynamicEpics: ReadonlyArray<{ key: string; label: string }>
  isLoading: boolean
  isError: boolean
  onSelect: (key: string) => void
  onRetry: () => void
}) {
  // styled popover listbox; native <select> does not support sectioned/custom-rendered options
  return (
    <div
      role="listbox"
      className="border-border bg-popover absolute top-full left-0 z-30 mt-1.5 w-full overflow-hidden rounded-md border py-1 text-[13px] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)]"
    >
      <div className={SECTION_LABEL_CLASS}>Pinned</div>
      <ul>
        {HARDCODED_PARENTS.map((parent) => (
          <ParentRow
            key={parent.key}
            entryKey={parent.key}
            label={parent.label}
            selected={parent.key === value}
            onSelect={onSelect}
          />
        ))}
      </ul>
      <div className="border-border my-1 border-t" />
      <div className={SECTION_LABEL_CLASS}>My in-progress epics</div>
      <DynamicSection
        isLoading={isLoading}
        isError={isError}
        epics={dynamicEpics}
        selectedKey={value}
        onSelect={onSelect}
        onRetry={onRetry}
      />
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
        className="hover:bg-surface-3 text-foreground aria-selected:bg-surface-3 flex w-full items-center gap-2 px-2.5 py-2 text-left transition-colors"
      >
        <span className="text-ink-subtle font-mono text-[11px]">{entryKey}</span>
        <span className="text-ink-tertiary">·</span>
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
        <Skeleton className="h-4 w-full rounded" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="text-ink-subtle px-2.5 py-1.5">
        Failed to load epics —{' '}
        <button
          type="button"
          onClick={onRetry}
          className="text-foreground focus-visible:ring-ring underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          retry
        </button>
      </div>
    )
  }
  if (epics.length === 0) {
    return <div className="text-ink-subtle px-2.5 py-1.5">No active epics assigned to you</div>
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
