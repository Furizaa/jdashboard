import { useCallback, useRef, useState } from 'react'
import { Maximize, Minus, Plus, X } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/design-system'
import { testIds } from '~/lib/testids'
import {
  FIT_VIEWPORT,
  panBy,
  wheelZoomFactor,
  zoomAbout,
  ZOOM_STEP,
  zoomLabel,
  type DiagramViewport,
} from '../../domain'

/**
 * One diagram, as large as the window allows, pannable and zoomable.
 *
 * A report column is ~768px wide and mermaid scales a diagram down to fit it, so
 * a flowchart of five systems arrives as unreadable grey. The inline rendering
 * stays what it is — a thumbnail that says "there is structure here" — and this
 * is where it is actually read.
 *
 * All of the arithmetic is in `domain/diagram-viewport`; what is left here is the
 * browser: a non-passive wheel listener, a pointer drag, and the keys.
 *
 * The SVG is the same string the inline block renders, already sanitised by
 * mermaid under `securityLevel: 'strict'` (ADR-0009 §8) — nothing re-renders it,
 * so no agent output is re-interpreted on the way into the overlay.
 */
export function DiagramOverlay({
  title,
  caption,
  svg,
  onClose,
}: {
  title: string
  caption: string | undefined
  svg: string
  onClose: () => void
}) {
  const [viewport, setViewport] = useState<DiagramViewport>(FIT_VIEWPORT)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)

  /**
   * `onWheel` in React is attached passively, so `preventDefault` there does
   * nothing and the page zooms instead of the diagram. A ref callback with a
   * cleanup (React 19) is the smallest way to own the listener properly.
   */
  const attachStage = useCallback((node: HTMLDivElement | null) => {
    stageRef.current = node
    if (node === null) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = node.getBoundingClientRect()
      setViewport((current) =>
        zoomAbout(current, wheelZoomFactor(event.deltaY), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        }),
      )
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', onWheel)
      stageRef.current = null
    }
  }, [])

  /** The buttons and the keys zoom about the middle of what is on screen. */
  const zoom = useCallback((factor: number) => {
    const rect = stageRef.current?.getBoundingClientRect()
    const centre = rect === undefined ? { x: 0, y: 0 } : { x: rect.width / 2, y: rect.height / 2 }
    setViewport((current) => zoomAbout(current, factor, centre))
  }, [])

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (drag === null || drag.pointerId !== event.pointerId) return
    dragRef.current = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY }
    setViewport((current) => panBy(current, event.clientX - drag.x, event.clientY - drag.y))
  }

  // Pointer capture is deliberately not used: ending the drag when the pointer
  // leaves the stage is the same gesture, and needs no capture to get right.
  const endDrag = () => {
    dragRef.current = null
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === '+' || event.key === '=') zoom(ZOOM_STEP)
    else if (event.key === '-') zoom(1 / ZOOM_STEP)
    else if (event.key === '0') setViewport(FIT_VIEWPORT)
    else return
    event.preventDefault()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid={testIds.explainDiagramOverlay}
        showCloseButton={false}
        onKeyDown={onKeyDown}
        className="flex h-[92vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]"
      >
        <DialogHeader className="border-border flex-row items-center gap-3 border-b px-4 py-2.5 text-left">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">
            {title}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Drag to pan, scroll to zoom. Plus and minus zoom, 0 fits, Escape closes.
          </DialogDescription>
          <div className="flex shrink-0 items-center gap-1">
            <ToolButton
              testId={testIds.explainDiagramZoomOut}
              label="Zoom out"
              onClick={() => zoom(1 / ZOOM_STEP)}
            >
              <Minus size={13} aria-hidden />
            </ToolButton>
            <span className="text-ink-subtle w-12 text-center font-mono text-[11px] tabular-nums">
              {zoomLabel(viewport)}
            </span>
            <ToolButton
              testId={testIds.explainDiagramZoomIn}
              label="Zoom in"
              onClick={() => zoom(ZOOM_STEP)}
            >
              <Plus size={13} aria-hidden />
            </ToolButton>
            <ToolButton
              testId={testIds.explainDiagramZoomReset}
              label="Fit the diagram"
              onClick={() => setViewport(FIT_VIEWPORT)}
            >
              <Maximize size={13} aria-hidden />
            </ToolButton>
            <span className="bg-border mx-1 h-4 w-px" aria-hidden />
            <ToolButton testId={undefined} label="Close" onClick={onClose}>
              <X size={14} aria-hidden />
            </ToolButton>
          </div>
        </DialogHeader>

        <div
          ref={attachStage}
          data-testid={testIds.explainDiagramStage}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
          className="bg-surface-1 relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
        >
          <div
            style={{
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: '0 0',
            }}
            // `!max-w-none` overrides the `max-width` mermaid writes inline on
            // the SVG — the same cap that makes the inline thumbnail small.
            className="h-full w-full p-6 [&_svg]:h-auto [&_svg]:w-full [&_svg]:!max-w-none"
          >
            {/* Sanitised by mermaid under `securityLevel: 'strict'`; not re-rendered here. */}
            <span dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
        </div>

        {caption !== undefined && (
          <p className="border-border text-ink-subtle shrink-0 border-t px-4 py-2 text-xs leading-relaxed">
            {caption}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ToolButton({
  testId,
  label,
  onClick,
  children,
}: {
  testId: string | undefined
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      title={label}
      className="text-ink-subtle hover:text-foreground hover:bg-surface-2 focus-visible:ring-ring inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
    </button>
  )
}
