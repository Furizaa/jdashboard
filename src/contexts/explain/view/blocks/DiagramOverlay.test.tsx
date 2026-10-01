import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { testIds } from '~/lib/testids'
import { MAX_SCALE, ZOOM_STEP } from '../../domain/diagram-viewport'
import { DiagramOverlay } from './DiagramOverlay'

afterEach(() => {
  cleanup()
})

// The arithmetic is covered exhaustively by `domain/diagram-viewport`. What is
// left to check here is the wiring: that each control reaches it, and that the
// transform the stage carries is the one the viewport describes.

const SVG = '<svg aria-label="diagram" style="max-width: 740px"><g></g></svg>'

function open(onClose = vi.fn()) {
  render(
    <DiagramOverlay title="Call path" caption="After the change." svg={SVG} onClose={onClose} />,
  )
  const content = screen.getByTestId(testIds.explainDiagramOverlay)
  const stage = screen.getByTestId(testIds.explainDiagramStage)
  // jsdom lays nothing out, so the stage's box — which is where the buttons and
  // the wheel zoom from — has to be stubbed.
  vi.spyOn(stage, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 600))
  const transformed = stage.firstElementChild as HTMLElement
  return { content, stage, transformed, onClose }
}

const scaleOf = (element: HTMLElement): number =>
  Number(/scale\((?<scale>[\d.]+)\)/u.exec(element.style.transform)?.groups?.scale ?? NaN)

describe('DiagramOverlay', () => {
  it('shows the diagram at 100%, unmoved', () => {
    const { content, transformed } = open()
    expect(content.innerHTML).toContain('aria-label="diagram"')
    expect(transformed.style.transform).toBe('translate(0px, 0px) scale(1)')
    expect(content).toHaveTextContent('100%')
  })

  it('zooms in and out from the buttons, about the middle of the stage', () => {
    const { content, transformed } = open()

    fireEvent.click(screen.getByTestId(testIds.explainDiagramZoomIn))
    expect(scaleOf(transformed)).toBeCloseTo(ZOOM_STEP, 10)
    expect(content).toHaveTextContent('125%')
    // Zooming about the centre moves the content, or the middle of the diagram
    // would not be the thing that stays put.
    expect(transformed.style.transform).not.toContain('translate(0px, 0px)')

    fireEvent.click(screen.getByTestId(testIds.explainDiagramZoomOut))
    expect(scaleOf(transformed)).toBeCloseTo(1, 10)
    expect(transformed.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('fits the diagram again from the reset button', () => {
    const { transformed } = open()
    fireEvent.click(screen.getByTestId(testIds.explainDiagramZoomIn))
    fireEvent.click(screen.getByTestId(testIds.explainDiagramZoomIn))
    expect(scaleOf(transformed)).toBeGreaterThan(1)

    fireEvent.click(screen.getByTestId(testIds.explainDiagramZoomReset))
    expect(transformed.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('zooms at the cursor on a wheel notch', () => {
    const { stage, transformed } = open()
    fireEvent.wheel(stage, { deltaY: -100, clientX: 200, clientY: 150 })
    expect(scaleOf(transformed)).toBeGreaterThan(1)
    // The point under the cursor is fixed, so the offset is pulled towards it.
    expect(transformed.style.transform).toContain('translate(-')
  })

  it('pans on a drag, and stops when the pointer leaves', () => {
    const { stage, transformed } = open()
    fireEvent.pointerDown(stage, { pointerId: 1, button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 140, clientY: 70 })
    expect(transformed.style.transform).toBe('translate(40px, -30px) scale(1)')

    fireEvent.pointerLeave(stage, { pointerId: 1 })
    fireEvent.pointerMove(stage, { pointerId: 1, clientX: 300, clientY: 300 })
    expect(transformed.style.transform).toBe('translate(40px, -30px) scale(1)')
  })

  it('zooms from the keyboard and fits on 0', () => {
    const { content, transformed } = open()
    fireEvent.keyDown(content, { key: '+' })
    expect(scaleOf(transformed)).toBeCloseTo(ZOOM_STEP, 10)
    fireEvent.keyDown(content, { key: '-' })
    expect(scaleOf(transformed)).toBeCloseTo(1, 10)

    fireEvent.keyDown(content, { key: '+' })
    fireEvent.keyDown(content, { key: '0' })
    expect(transformed.style.transform).toBe('translate(0px, 0px) scale(1)')
  })

  it('cannot be zoomed past the limit, however many notches', () => {
    const { transformed } = open()
    for (let notch = 0; notch < 40; notch += 1) {
      fireEvent.click(screen.getByTestId(testIds.explainDiagramZoomIn))
    }
    expect(scaleOf(transformed)).toBe(MAX_SCALE)
  })

  it('closes on Escape and on the close button', () => {
    const escaped = vi.fn()
    const { content } = open(escaped)
    fireEvent.keyDown(content, { key: 'Escape' })
    expect(escaped).toHaveBeenCalledTimes(1)
    cleanup()

    const clicked = vi.fn()
    open(clicked)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(clicked).toHaveBeenCalledTimes(1)
  })
})
