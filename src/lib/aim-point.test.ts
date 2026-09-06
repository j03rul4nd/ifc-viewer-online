// ─── aim-point tests ──────────────────────────────────────────────────────────
// THE RULE THIS FILE EXISTS FOR:
//
//   the ordinary case is the one that breaks, because it is the one nobody
//   writes a test for.
//
// The bug this module was extracted from is the whole reason it is a module:
// aiming while NOT pointer-locked recursed into itself instead of returning the
// cursor, so it threw a stack overflow on every pointer move and every click.
// Hover, selection and the context menu all died at once, and walking — the
// feature the change was for, and the only branch exercised — kept working.

import { describe, it, expect } from 'vitest'
import { aimPoint } from './aim-point'

const RECT = { left: 100, top: 60, width: 800, height: 400 }

describe('aimPoint', () => {
  it('returns the cursor when the pointer is not locked', () => {
    // THE REGRESSION. This case used to recurse until the stack overflowed.
    expect(aimPoint(false, RECT, 437, 219)).toEqual({ x: 437, y: 219 })
  })

  it('returns the centre of the canvas when the pointer is locked', () => {
    // Walking: there is no cursor, and clientX/clientY are frozen wherever they
    // were when the lock was taken. The crosshair is the aim.
    expect(aimPoint(true, RECT, 437, 219)).toEqual({ x: 500, y: 260 })
  })

  it('ignores the frozen cursor entirely while locked', () => {
    // The frozen coordinates are not merely stale, they are misleading: they
    // point at whatever was under the mouse when walking started.
    const a = aimPoint(true, RECT, 0, 0)
    const b = aimPoint(true, RECT, 9999, 9999)
    expect(a).toEqual(b)
  })

  it('follows the canvas when it is not at the viewport origin', () => {
    // The canvas sits under the toolbar. Centring on the viewport instead of on
    // the canvas would aim above the crosshair by half the toolbar's height.
    const offset = aimPoint(true, { left: 0, top: 0, width: 800, height: 400 }, 1, 1)
    expect(aimPoint(true, RECT, 1, 1)).not.toEqual(offset)
  })

  it('is total: every input returns a finite point', () => {
    // Called from a pointer handler on every move. A throw here is not an error
    // the user sees, it is a feature that silently stops existing.
    for (const locked of [true, false]) {
      for (const [x, y] of [[0, 0], [-5, -5], [1e6, 1e6]]) {
        const p = aimPoint(locked, RECT, x, y)
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${locked} ${x},${y}`).toBe(true)
      }
    }
  })
})
