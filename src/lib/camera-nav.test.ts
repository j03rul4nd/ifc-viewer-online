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
    smoothTime: 0.25,
    draggingSmoothTime: 0.125,
    restThreshold: 0.0025,
    infinityDolly: false,
    mouseButtons: { left: ORBIT, middle: 0, right: 0 },
  }
}

function makeTarget(): NavKeyTarget & {
  fire(type: string, key?: string, patch?: Record<string, unknown>): void
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
    fire(type, key, patch = {}) {
      for (const l of listeners.get(type) ?? []) l({ type, key, ...patch } as unknown as Event)
    },
    count() {
      let n = 0
      for (const set of listeners.values()) n += set.size
      return n
    },
  }
}

function bind(controls = makeControls(), target = makeTarget()) {
  const teardown = bindNavigation(controls, target, { truckAction: TRUCK, wheelTarget: target })
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

  it('uses responsive motion timings instead of a long camera tail', () => {
    const { controls } = bind()
    expect(controls.dollySpeed).toBe(2)
    expect(controls.truckSpeed).toBe(2)
    expect(controls.smoothTime).toBeLessThan(0.2)
    expect(controls.draggingSmoothTime).toBeLessThan(controls.smoothTime)
    expect(controls.restThreshold).toBe(0.01)
  })

  it('backs out faster and accelerates a sustained wheel gesture', () => {
    const { controls, target } = bind()

    target.fire('wheel', undefined, { deltaY: 100, timeStamp: 1_000 })
    const firstOut = controls.dollySpeed
    expect(firstOut).toBe(2.6)

    target.fire('wheel', undefined, { deltaY: 100, timeStamp: 1_080 })
    expect(controls.dollySpeed).toBeGreaterThan(firstOut)

    // However long the gesture runs, it plateaus rather than running away. The
    // ceiling itself is a tuning value and is deliberately not pinned here —
    // raising it is a legitimate change and should not fail the build.
    let t = 1_080
    for (let i = 0; i < 40; i++) target.fire('wheel', undefined, { deltaY: 100, timeStamp: (t += 80) })
    const plateau = controls.dollySpeed
    target.fire('wheel', undefined, { deltaY: 100, timeStamp: (t += 80) })
    expect(controls.dollySpeed).toBe(plateau)
    expect(plateau).toBeGreaterThan(firstOut)

    target.fire('wheel', undefined, { deltaY: -100, timeStamp: t + 400 })
    expect(controls.dollySpeed).toBe(2)
  })

  it('resets wheel acceleration before a pointer/pinch gesture', () => {
    const { controls, target } = bind()
    target.fire('wheel', undefined, { deltaY: 100, timeStamp: 1_000 })
    expect(controls.dollySpeed).toBeGreaterThan(2)
    target.fire('pointerdown')
    expect(controls.dollySpeed).toBe(2)
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

describe('right button: drag pans, click still opens the menu', () => {
  /**
   * A right press that moves `dx` pixels, then releases.
   * Returns what the app would actually see: whether the platform's own menu
   * event was let through, and whether a menu was raised on the canvas.
   */
  function rightPress(target: ReturnType<typeof makeTarget>, dx: number) {
    let nativeAllowed = true
    let raised = 0
    const canvas = {
      dispatchEvent: (ev: Event) => { if (ev.type === 'contextmenu') raised++; return true },
    }

    target.fire('pointerdown', undefined, { button: 2, clientX: 100, clientY: 100, target: canvas })
    target.fire('pointermove', undefined, { button: 2, clientX: 100 + dx, clientY: 100, target: canvas })
    // The platform raises its menu event: on Windows/Linux at release, on macOS
    // at press. Either way it must not reach the app.
    target.fire('contextmenu', undefined, {
      preventDefault: () => { nativeAllowed = false },
      stopPropagation: () => {},
      stopImmediatePropagation: () => {},
    })
    target.fire('pointerup', undefined, { button: 2, clientX: 100 + dx, clientY: 100, target: canvas })
    return { nativeAllowed, raised }
  }

  it('binds the right button to pan, which is what people reach for', () => {
    // Pan used to live on the middle button and a Shift override only. Anyone
    // on a trackpad or a Magic Mouse had no pan at all, so the scene turned
    // around one fixed point and read as "locked onto the model".
    const { controls } = bind()
    expect(controls.mouseButtons.right).toBe(TRUCK)
  })

  it("never lets the platform's own menu event through", () => {
    // Suppressing only "after a drag" is not portable: macOS fires contextmenu
    // on mouse DOWN, before any movement exists to judge, so a menu would pop
    // up at the start of every pan.
    const target = makeTarget()
    bind(makeControls(), target)
    expect(rightPress(target, 40).nativeAllowed).toBe(false)
    expect(rightPress(target, 1).nativeAllowed).toBe(false)
  })

  it('raises the menu itself when the press was a CLICK', () => {
    const target = makeTarget()
    bind(makeControls(), target)
    expect(rightPress(target, 2).raised).toBe(1)
  })

  it('raises no menu when the press was a DRAG', () => {
    const target = makeTarget()
    bind(makeControls(), target)
    expect(rightPress(target, 40).raised).toBe(0)
  })

  it('does not let one drag suppress the NEXT click menu', () => {
    const target = makeTarget()
    bind(makeControls(), target)
    expect(rightPress(target, 40).raised).toBe(0)
    expect(rightPress(target, 1).raised).toBe(1)
  })

  it('ignores movement from other buttons', () => {
    const target = makeTarget()
    bind(makeControls(), target)
    target.fire('pointermove', undefined, { button: 0, clientX: 900, clientY: 900 })
    expect(rightPress(target, 1).raised).toBe(1)
  })

  it('removes its pointer listeners on teardown', () => {
    const target = makeTarget()
    const { teardown } = bind(makeControls(), target)
    expect(target.count()).toBeGreaterThan(0)
    teardown()
    expect(target.count()).toBe(0)
  })
})

describe('zooming out must not lose the model', () => {
  it('lets the target run ahead going IN, and pins it going OUT', () => {
    // infinityDolly cuts both ways: past maxDistance it drags the orbit target
    // outward as well, so a sustained scroll-out walks the whole rig into empty
    // space. Measured on a 118 m model, thirty wheel clicks ended 3 900 km away
    // with nothing on screen. In: unbounded. Out: bounded.
    const { controls, target } = bind()

    target.fire('wheel', undefined, { deltaY: -100, timeStamp: 1_000 })
    expect(controls.infinityDolly).toBe(true)

    target.fire('wheel', undefined, { deltaY: 100, timeStamp: 1_400 })
    expect(controls.infinityDolly).toBe(false)

    target.fire('wheel', undefined, { deltaY: -100, timeStamp: 1_800 })
    expect(controls.infinityDolly).toBe(true)
  })

  it('re-arms the inward behaviour for a pinch', () => {
    const { controls, target } = bind()
    target.fire('wheel', undefined, { deltaY: 100, timeStamp: 1_000 })
    expect(controls.infinityDolly).toBe(false)
    target.fire('pointerdown', undefined, { button: 0 })
    expect(controls.infinityDolly).toBe(true)
  })
})
