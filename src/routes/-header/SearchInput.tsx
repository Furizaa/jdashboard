import { useEffect, useRef } from 'react'
import { Search } from 'lucide-react'

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
      const isMod = e.metaKey || e.ctrlKey
      if (!isMod || e.key.toLowerCase() !== 'k') return
      const active = document.activeElement
      const isOtherTextInput =
        active !== inputRef.current &&
        (active instanceof HTMLInputElement ||
          active instanceof HTMLTextAreaElement ||
          (active instanceof HTMLElement && active.isContentEditable))
      if (isOtherTextInput) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="relative w-60">
      <Search
        size={14}
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
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
        className="border-border bg-background text-foreground placeholder:text-muted-foreground focus-visible:ring-ring h-7 w-full rounded border pr-2 pl-7 text-xs focus-visible:ring-1 focus-visible:outline-none"
      />
    </div>
  )
}
