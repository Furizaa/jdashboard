import { cn } from '~/lib/cn'

export function FixasapRibbon({ size }: { size: 'card' | 'panel' }) {
  return (
    <div
      role="img"
      aria-label="Urgent (FIXASAP)"
      className={cn(
        'pointer-events-none absolute top-0 right-0 overflow-hidden',
        size === 'card' ? 'h-4 w-4 rounded-tr-lg' : 'h-[22px] w-[22px] rounded-tr-xl',
      )}
    >
      <div
        aria-hidden
        className="bg-destructive absolute inset-0"
        style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%)' }}
      />
    </div>
  )
}
