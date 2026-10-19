import { describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNodeReveal } from './use-node-reveal'

// The `?node=` hand-off's three rules (ADR-0012, issue 96): it fires **once**,
// it clears the param **before** revealing — which is what stops a refresh or a
// back-navigation re-announcing a lane the reader has already been shown — and a
// second, different node is a second hand-off rather than a no-op.

type Props = { node: string | null }

function harness(initial: Props) {
  const calls: string[] = []
  const reveal = vi.fn((nodeId: string) => calls.push(`reveal:${nodeId}`))
  const onConsumed = vi.fn(() => calls.push('consumed'))
  const rendered = renderHook((p: Props) => useNodeReveal(p.node, reveal, onConsumed), {
    initialProps: initial,
  })
  return { ...rendered, reveal, onConsumed, calls }
}

describe('useNodeReveal', () => {
  it('consumes the param first, then reveals — once, however often it re-renders', () => {
    const { rerender, reveal, onConsumed, calls } = harness({ node: 'geo-141' })
    rerender({ node: 'geo-141' })
    rerender({ node: 'geo-141' })

    expect(reveal).toHaveBeenCalledTimes(1)
    expect(reveal).toHaveBeenCalledWith('geo-141')
    expect(onConsumed).toHaveBeenCalledTimes(1)
    // Order is the rule, not an accident: clearing after revealing would leave
    // the param in the URL for a refresh to act on again.
    expect(calls).toEqual(['consumed', 'reveal:geo-141'])
  })

  it('does nothing at all when no node was handed off', () => {
    const { reveal, onConsumed } = harness({ node: null })
    expect(reveal).not.toHaveBeenCalled()
    expect(onConsumed).not.toHaveBeenCalled()
  })

  // The param going away is what `onConsumed` causes, and it must not look like
  // a fresh hand-off when it comes back later.
  it('does not re-reveal when the consumed param falls away', () => {
    const { rerender, reveal } = harness({ node: 'geo-141' })
    rerender({ node: null })
    rerender({ node: null })
    expect(reveal).toHaveBeenCalledTimes(1)
  })

  it('treats a different node as a second hand-off', () => {
    const { rerender, reveal } = harness({ node: 'geo-141' })
    rerender({ node: null })
    rerender({ node: 'geo-150' })
    expect(reveal).toHaveBeenNthCalledWith(1, 'geo-141')
    expect(reveal).toHaveBeenNthCalledWith(2, 'geo-150')
  })

  // The same lane asked for again — `g` on the same ticket twice — is a real
  // hand-off: the param left and came back, so the latch has already reset.
  it('reveals the same node again after the param has cleared', () => {
    const { rerender, reveal } = harness({ node: 'geo-141' })
    rerender({ node: null })
    rerender({ node: 'geo-141' })
    expect(reveal).toHaveBeenCalledTimes(2)
  })
})
