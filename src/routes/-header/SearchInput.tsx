import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'

function isModK(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
}

function isTextInput(el: Element | null): boolean {
  if (el instanceof HTMLInputElement) return true
  if (el instanceof HTMLTextAreaElement) return true
  return el instanceof HTMLElement && el.isContentEditable
}

function isFocusedInOtherTextInput(self: HTMLInputElement | null): boolean {
  const active = document.activeElement
  return active !== self && isTextInput(active)
}

export function SearchInput({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isModK(e)) return
      if (isFocusedInOtherTextInput(inputRef.current)) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative w-64">
      <Search
        size={13}
        className="text-ink-tertiary pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
      />
      <input
        ref={inputRef}
        type="search"
        placeholder="Search…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onChange('')
            inputRef.current?.blur()
          }
        }}
        className="border-border bg-surface-1 text-foreground placeholder:text-ink-tertiary focus:bg-surface-2 focus-visible:ring-ring focus:border-border-strong h-8 w-full rounded-md border pr-8 pl-7 text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
      />
      <kbd
        aria-hidden="true"
        className="text-ink-tertiary bg-surface-2 border-border absolute top-1/2 right-1.5 hidden -translate-y-1/2 items-center justify-center rounded border px-1 font-mono text-[10px] leading-[14px] sm:inline-flex"
      >
        ⌘K
      </kbd>
    </div>
  )
}
