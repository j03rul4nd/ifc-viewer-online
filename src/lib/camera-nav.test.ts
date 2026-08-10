import { describe, it, expect } from 'vitest'
import { bindNavigation, type NavigableControls, type NavKeyTarget } from './camera-nav'

/** camera-controls' ACTION values are opaque numbers; only identity matters. */
const ORBIT = 1
const TRUCK = 2

function makeControls(): NavigableControls<number> {
  return {
    dollyToCursor: false,
    dollySpeed: 1,
    truckSpeed: 1,
    infinityDolly: false,
    mouseButtons: { left: ORBIT, middle: 0 },
  }
}

function makeTarget(): NavKeyTarget & {
  fire(type: string, key?: string): void
  count(): number
} {
  const listeners = new Map<string, Set<(e: Event) => void>>()
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener)
    },
    fire(type, key) {
      for (const l of listeners.get(type) ?? []) l({ type, key } as unknown as Event)
    },
    count() {
      let n = 0
      for (const set of listeners.values()) n += set.size
      return n
    },
  }
}

function bind(controls = makeControls(), target = makeTarget()) {
  const teardown = bindNavigation(controls, target, { truckAction: TRUCK })
  return { controls, target, teardown }
}

describe('bindNavigation', () => {
  it('gives the scene a pan, which right-drag could not because the context menu owns it', () => {
    const { controls } = bind()
    expect(controls.mouseButtons.middle).toBe(TRUCK)
  })

  it('keeps zooming past the approach floor instead of stopping dead', () => {
    const { controls } = bind()
    expect(controls.infinityDolly).toBe(true)
    expect(controls.dollyToCursor).toBe(true)
  })

  it('pans on Shift+drag and hands the button back on release', () => {
    const { controls, target } = bind()

    target.fire('keydown', 'Shift')
    expect(controls.mouseButtons.left).toBe(TRUCK)

    target.fire('keyup', 'Shift')
    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('survives the auto-repeat that would otherwise make the pan permanent', () => {
    const { controls, target } = bind()

    // Holding Shift repeats keydown. Re-capturing on each one would save TRUCK
    // as the action to restore, and left-drag would pan for the rest of the
    // session with nothing to undo it.
    target.fire('keydown', 'Shift')
    target.fire('keydown', 'Shift')
    target.fire('keydown', 'Shift')
    target.fire('keyup', 'Shift')

    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('un-sticks the button when the window loses focus mid-drag', () => {
    const { controls, target } = bind()

    // Alt-tab away while panning: the keyup lands in another window.
    target.fire('keydown', 'Shift')
    target.fire('blur')
    expect(controls.mouseButtons.left).toBe(ORBIT)

    // ...and the keyup that arrives later must not undo the recovery.
    target.fire('keyup', 'Shift')
    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('ignores keys that are not Shift', () => {
    const { controls, target } = bind()

    target.fire('keydown', 'Control')
    target.fire('keydown', 'a')
    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('removes its listeners, which the inline version never did', () => {
    const { target, teardown } = bind()
    expect(target.count()).toBeGreaterThan(0)

    teardown()
    expect(target.count()).toBe(0)
  })

  it('does not leave a disposed viewer stuck on pan', () => {
    const { controls, target, teardown } = bind()

    target.fire('keydown', 'Shift')
    teardown()

    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('leaves a torn-down binding deaf to later keys', () => {
    const { controls, target, teardown } = bind()
    teardown()

    target.fire('keydown', 'Shift')
    expect(controls.mouseButtons.left).toBe(ORBIT)
  })
})
