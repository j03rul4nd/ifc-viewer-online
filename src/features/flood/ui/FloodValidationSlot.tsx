// ─── FloodValidationSlot ──────────────────────────────────────────────────────
// Where the validation panel shows the flood result: nothing at all until a
// flood run has been analysed (and nothing in a build without the flood
// flag), then the group, loaded on demand. Light on purpose — the validation
// panel imports it statically.
//
// `onResize` lets the desktop panel re-measure where its virtualised issue
// list starts: the group sits above it and opens, closes and grows.

import React, { Suspense, useLayoutEffect, useRef } from 'react'
import { isFloodEnabled } from '../flag'
import { useFloodStore } from '../store'

const FloodValidationGroup = React.lazy(() => import('./FloodValidationGroup'))

interface Props {
  onJump(expressId: number, modelId: string): void
  onResize?(): void
  mobile?: boolean
}

export function FloodValidationSlot({ onJump, onResize, mobile }: Props) {
  const has = useFloodStore((s) => s.affected !== null)
  const ref = useRef<HTMLDivElement>(null)
  const resize = useRef(onResize)
  resize.current = onResize

  useLayoutEffect(() => {
    const el = ref.current
    resize.current?.()
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => resize.current?.())
    ro.observe(el)
    return () => ro.disconnect()
  }, [has])

  if (!isFloodEnabled() || !has) return null
  return (
    <div ref={ref}>
      <Suspense fallback={null}>
        <FloodValidationGroup onJump={onJump} mobile={mobile} />
      </Suspense>
    </div>
  )
}
