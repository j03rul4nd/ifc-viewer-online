import { describe, it, expect, beforeEach } from 'vitest'
import {
  bindWalkNavigation,
  type WalkControls,
  type WalkEventTarget,
  type WalkNavigation,
  type WalkState,
  type WalkVec,
} from './camera-walk'

const ORBIT = 'orbit' as const
const NONE  = 'none'  as const
type Action = typeof ORBIT | typeof NONE

interface Look { px: number; py: number; pz: number; tx: number; ty: number; tz: number }

function makeControls(): WalkControls<Action> & { look: Look } {
  const look: Look = { px: 0, py: 0, pz: 0, tx: 0, ty: 0, tz: -10 }
  return {
    look,
    mouseButtons: { left: ORBIT as Action },
    getPosition(): WalkVec { return { x: look.px, y: look.py, z: look.pz } },
    getTarget(): WalkVec { return { x: look.tx, y: look.ty, z: look.tz } },
    setLookAt(px, py, pz, tx, ty, tz) {
      look.px = px; look.py = py; look.pz = pz
      look.tx = tx; look.ty = ty; look.tz = tz
    },
  }
}

/** A window stand-in that hands back the listeners so tests can fire events. */
function makeTarget(): WalkEventTarget & {
  fire(type: string, event: unknown): void
  count(type: string): number
  lockRequests: number
} {
  const listeners = new Map<string, Set<(e: Event) => void>>()
  return {
    lockRequests: 0,
    requestPointerLock() { this.lockRequests++ },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(listener)
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener) },
    fire(type, event) { for (const l of listeners.get(type) ?? []) l(event as Event) },
    count(type) { return listeners.get(type)?.size ?? 0 },
  }
}

let controls: ReturnType<typeof makeControls>
let target: ReturnType<typeof makeTarget>
let nav: WalkNavigation
let states: WalkState[]
let locked: boolean
let exitCalls: number

function setup(overrides: Partial<Parameters<typeof bindWalkNavigation<Action>>[2]> = {}): void {
  controls = makeControls()
  target = makeTarget()
  states = []
  locked = false
  exitCalls = 0
  nav = bindWalkNavigation(controls, target, {
    noneAction: NONE,
    // No rAF in the test — frames are advanced by hand through tick().
    requestFrame: () => 1,
    cancelFrame: () => {},
    accelTime: 0,       // no easing, so a single frame equals the full step
    lookSmoothing: 0,   // ditto for turning
    speed: 2,
    eyeDistance: 1.5,
    eyeHeight: 1.7,
    onStateChange: (s) => { states.push(s) },
    isPointerLocked: () => locked,
    exitPointerLock: () => { exitCalls++; locked = false },
    ...overrides,
  })
}

/** Run a stretch of walking as sixty frames a second, the way the loop would. */
function run(seconds: number): void {
  const frames = Math.round(seconds * 60)
  for (let i = 0; i < frames; i++) nav.tick(1 / 60)
}

const key = (code: string, extra: Record<string, unknown> = {}): unknown =>
  ({ code, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null, preventDefault: () => {}, ...extra })

const wheel = (deltaY: number): unknown =>
  ({ deltaY, preventDefault: () => {}, stopPropagation: () => {}, stopImmediatePropagation: () => {} })

const eyeDistanceNow = (): number => Math.hypot(
  controls.look.tx - controls.look.px,
  controls.look.ty - controls.look.py,
  controls.look.tz - controls.look.pz,
)

describe('bindWalkNavigation', () => {
  beforeEach(() => setup())

  // ── Arming ────────────────────────────────────────────────────────────────
  it('is inert until started', () => {
    target.fire('keydown', key('KeyW'))
    run(1)
    expect(controls.look.pz).toBe(0)
    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('takes the left button while active and gives it back on stop', () => {
    nav.start()
    expect(controls.mouseButtons.left).toBe(NONE)
    nav.stop()
    expect(controls.mouseButtons.left).toBe(ORBIT)
  })

  it('pulls the orbit target to arm’s length on start, keeping the direction', () => {
    nav.start()
    expect(controls.look.tz).toBeCloseTo(-1.5, 5)
    expect(controls.look.tx).toBeCloseTo(0, 5)
  })

  it('pushes the orbit target back out on stop, so orbiting works again', () => {
    nav.start()
    nav.stop()
    expect(eyeDistanceNow()).toBeGreaterThanOrEqual(12)
  })

  // ── Moving ────────────────────────────────────────────────────────────────
  it('walks forward along the view at the configured speed', () => {
    nav.start()
    target.fire('keydown', key('KeyW'))
    run(1)
    expect(controls.look.pz).toBeCloseTo(-2, 1)   // 2 m/s for one second
    expect(controls.look.py).toBeCloseTo(0, 5)
  })

  it('strafes sideways without turning', () => {
    nav.start()
    target.fire('keydown', key('KeyD'))
    run(1)
    expect(controls.look.px).toBeCloseTo(2, 1)
    expect(controls.look.pz).toBeCloseTo(0, 5)
  })

  it('does not make diagonals faster than straight lines', () => {
    nav.start()
    target.fire('keydown', key('KeyW'))
    target.fire('keydown', key('KeyD'))
    run(1)
    const travelled = Math.hypot(controls.look.px, controls.look.pz)
    expect(travelled).toBeCloseTo(2, 1)
  })

  it('stops when the key comes up', () => {
    nav.start()
    target.fire('keydown', key('KeyW'))
    run(0.5)
    target.fire('keyup', key('KeyW'))
    const restingZ = controls.look.pz
    run(1)
    expect(controls.look.pz).toBeCloseTo(restingZ, 5)
  })

  it('eases into motion rather than starting at full speed', () => {
    setup({ accelTime: 0.12 })
    nav.start()
    target.fire('keydown', key('KeyW'))
    nav.tick(1 / 60)
    // A single frame at full speed would be 2/60 ≈ 0.033 m.
    expect(Math.abs(controls.look.pz)).toBeLessThan(2 / 60 * 0.6)
    expect(Math.abs(controls.look.pz)).toBeGreaterThan(0)
  })

  it('walks the floor, not the slab, when looking down', () => {
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 0 })
    target.fire('pointermove', { clientX: 0, clientY: 400 })
    target.fire('pointerup', { button: 0 })
    nav.tick(1 / 60)
    expect(controls.look.ty).toBeLessThan(controls.look.py)   // we are looking down

    const beforeY = controls.look.py
    target.fire('keydown', key('KeyW'))
    run(1)
    expect(controls.look.py).toBeCloseTo(beforeY, 5)
    expect(controls.look.pz).toBeLessThan(beforeY - 1)        // but we did move
  })

  it('raises and lowers the eye on Q/E', () => {
    nav.start()
    target.fire('keydown', key('KeyE'))
    run(1)
    expect(controls.look.py).toBeCloseTo(2, 1)
  })

  it('sprints on Shift and creeps on Alt', () => {
    nav.start()
    target.fire('keydown', key('KeyW', { shiftKey: true }))
    run(1)
    const sprinted = Math.abs(controls.look.pz)
    expect(sprinted).toBeGreaterThan(3)

    setup()
    nav.start()
    target.fire('keydown', key('KeyW', { altKey: true }))
    run(1)
    expect(Math.abs(controls.look.pz)).toBeLessThan(1)
  })

  it('ignores keys typed into an input', () => {
    nav.start()
    target.fire('keydown', key('KeyW', { target: { tagName: 'INPUT' } }))
    run(1)
    expect(controls.look.pz).toBe(0)
  })

  it('drops held keys when the window loses focus mid-stride', () => {
    nav.start()
    target.fire('keydown', key('KeyW'))
    run(0.2)
    target.fire('blur', {})
    const parked = controls.look.pz
    run(2)
    expect(controls.look.pz).toBeCloseTo(parked, 5)
  })

  it('clamps a long frame so a backgrounded tab does not teleport', () => {
    nav.start()
    target.fire('keydown', key('KeyW'))
    nav.tick(10)
    expect(Math.abs(controls.look.pz)).toBeLessThanOrEqual(2 * 0.1 + 1e-6)
  })

  // ── Ambient movement (the mode is off, the keys still work) ───────────────
  it('moves on WASD with walk mode off — the keys people press first', () => {
    nav.setAmbientMovement(true)
    target.fire('keydown', key('KeyW'))
    run(1)
    expect(controls.look.pz).toBeCloseTo(-2, 1)
    expect(nav.isActive()).toBe(false)
  })

  it('leaves the orbit rig alone while doing it', () => {
    nav.setAmbientMovement(true)
    const radiusBefore = eyeDistanceNow()
    target.fire('keydown', key('KeyD'))
    run(1)
    // The button still orbits, and the orbit still turns around a point at the
    // same distance — shortening it behind someone who only pressed a key would
    // leave their next drag spinning around their own face.
    expect(controls.mouseButtons.left).toBe(ORBIT)
    expect(eyeDistanceNow()).toBeCloseTo(radiusBefore, 3)
  })

  it('does not take the arrows or Space from the panels when the mode is off', () => {
    nav.setAmbientMovement(true)
    target.fire('keydown', key('ArrowUp'))
    target.fire('keydown', key('Space'))
    run(1)
    expect(controls.look.px).toBe(0)
    expect(controls.look.py).toBe(0)
    expect(controls.look.pz).toBe(0)
  })

  it('does not look on a drag while the mode is off — that is still orbit', () => {
    nav.setAmbientMovement(true)
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 0 })
    target.fire('pointermove', { clientX: 200, clientY: 0 })
    nav.tick(1 / 60)
    expect(controls.look.tx).toBeCloseTo(0, 5)
  })

  it('stops asking for frames once ambient movement has coasted to a stop', () => {
    let scheduled = 0
    let pending: ((t: number) => void) | null = null
    setup({
      requestFrame: (cb) => { scheduled++; pending = cb; return scheduled },
      cancelFrame: () => { pending = null },
    })
    const pump = (n: number): void => {
      for (let i = 0; i < n; i++) { const cb = pending; pending = null; cb?.(0) }
    }
    nav.setAmbientMovement(true)
    expect(scheduled).toBe(0)          // idle costs nothing at all

    target.fire('keydown', key('KeyW'))
    expect(scheduled).toBe(1)
    pump(20)
    const whileHeld = scheduled
    expect(whileHeld).toBeGreaterThan(1)

    target.fire('keyup', key('KeyW'))
    pump(400)                          // coast down, then give up
    const settled = scheduled
    pump(50)
    expect(scheduled).toBe(settled)
  })

  it('gives the keys back when ambient movement is turned off', () => {
    nav.setAmbientMovement(true)
    nav.setAmbientMovement(false)
    target.fire('keydown', key('KeyW'))
    run(1)
    expect(controls.look.pz).toBe(0)
  })

  // ── The on-screen stick ───────────────────────────────────────────────────
  it('walks on analog input, at a fraction of the speed for a fraction of the stick', () => {
    nav.start()
    nav.setMoveInput(0.5, 0)
    run(1)
    expect(Math.abs(controls.look.pz)).toBeCloseTo(1, 1)
  })

  it('lets the stick and the keys drive the same rig without doubling up', () => {
    nav.start()
    nav.setMoveInput(1, 0)
    target.fire('keydown', key('KeyW'))
    run(1)
    expect(Math.abs(controls.look.pz)).toBeCloseTo(2, 1)   // clamped, not 2×
  })

  // ── Looking ───────────────────────────────────────────────────────────────
  it('turns on left-drag and leaves the position alone', () => {
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 100, clientY: 100 })
    target.fire('pointermove', { clientX: 200, clientY: 100 })
    nav.tick(1 / 60)
    expect(controls.look.px).toBeCloseTo(0, 5)
    expect(controls.look.pz).toBeCloseTo(0, 5)
    expect(controls.look.tx).not.toBeCloseTo(0, 2)
  })

  it('does not turn on a Shift-drag, which still pans', () => {
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 100, clientY: 100, shiftKey: true })
    target.fire('pointermove', { clientX: 200, clientY: 100 })
    nav.tick(1 / 60)
    expect(controls.look.tx).toBeCloseTo(0, 5)
  })

  it('spreads a pointer jump over several frames when smoothing is on', () => {
    setup({ lookSmoothing: 0.08 })
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 0 })
    target.fire('pointermove', { clientX: 300, clientY: 0 })

    nav.tick(1 / 60)
    const firstFrame = Math.abs(Math.atan2(controls.look.tx - controls.look.px, -(controls.look.tz - controls.look.pz)))
    run(0.5)
    const settled = Math.abs(Math.atan2(controls.look.tx - controls.look.px, -(controls.look.tz - controls.look.pz)))
    expect(firstFrame).toBeGreaterThan(0)
    expect(settled).toBeGreaterThan(firstFrame * 2)   // still catching up after frame one
  })

  it('never pitches past straight up, and does not bank the overshoot', () => {
    nav.start()
    // Two huge upward drags: the second must not be owed back on the way down.
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 1000 })
    target.fire('pointermove', { clientX: 0, clientY: 0 })
    nav.tick(1 / 60)
    target.fire('pointermove', { clientX: 0, clientY: -1000 })
    nav.tick(1 / 60)
    const flat = Math.hypot(controls.look.tx - controls.look.px, controls.look.tz - controls.look.pz)
    expect(flat).toBeGreaterThan(0)          // never fully degenerate

    // Now look back down: one modest drag should visibly lower the view.
    target.fire('pointermove', { clientX: 0, clientY: 200 })
    nav.tick(1 / 60)
    expect(controls.look.ty - controls.look.py).toBeLessThan(1.4)
  })

  it('turns on an explicit look(), which is how touch drives it', () => {
    nav.start()
    nav.look(0.5, 0)
    nav.tick(1 / 60)
    expect(controls.look.tx).not.toBeCloseTo(0, 2)
  })

  // ── Pointer lock ──────────────────────────────────────────────────────────
  it('captures the cursor on a mouse press, so a 180° turn is not a drag limit', () => {
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 0, pointerType: 'mouse' })
    expect(target.lockRequests).toBe(1)
  })

  it('never captures the cursor for a finger', () => {
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 0, pointerType: 'touch' })
    expect(target.lockRequests).toBe(0)
  })

  it('does not capture when the user turned lock off', () => {
    nav.setPointerLockEnabled(false)
    nav.start()
    target.fire('pointerdown', { button: 0, clientX: 0, clientY: 0, pointerType: 'mouse' })
    expect(target.lockRequests).toBe(0)
  })

  it('turns on raw movement deltas while locked, with no button held', () => {
    nav.start()
    locked = true
    target.fire('pointerlockchange', {})
    target.fire('pointermove', { movementX: 120, movementY: 0 })
    nav.tick(1 / 60)
    expect(controls.look.tx).not.toBeCloseTo(0, 2)
  })

  it('releases the cursor when walk mode ends', () => {
    nav.start()
    locked = true
    target.fire('pointerlockchange', {})
    nav.stop()
    expect(exitCalls).toBe(1)
  })

  // ── Speed ─────────────────────────────────────────────────────────────────
  it('spends the wheel on speed, not on a dolly', () => {
    nav.start()
    const before = nav.getSpeed()
    target.fire('wheel', wheel(-100))
    expect(nav.getSpeed()).toBeGreaterThan(before)
    target.fire('wheel', wheel(100))
    expect(nav.getSpeed()).toBeCloseTo(before, 5)
  })

  it('keeps the wheel out of it while orbiting', () => {
    const before = nav.getSpeed()
    target.fire('wheel', wheel(-100))
    expect(nav.getSpeed()).toBe(before)
  })

  it('leaves the wheel alone when it is over a panel, not the viewport', () => {
    // The canvas and the window are different targets in the app: the issue
    // list has to keep scrolling while someone is standing in a corridor.
    const canvas = makeTarget()
    controls = makeControls()
    target = makeTarget()
    nav = bindWalkNavigation(controls, target, {
      noneAction: NONE,
      pointerTarget: canvas,
      requestFrame: () => 1,
      cancelFrame: () => {},
      speed: 2,
    })
    nav.start()
    const before = nav.getSpeed()
    target.fire('wheel', { ...(wheel(-100) as object), target: { tagName: 'DIV' } })
    expect(nav.getSpeed()).toBe(before)
    target.fire('wheel', { ...(wheel(-100) as object), target: canvas })
    expect(nav.getSpeed()).toBeGreaterThan(before)
  })

  it('clamps the speed to a usable band', () => {
    setup({ minSpeed: 1, maxSpeed: 5 })
    nav.start()
    for (let i = 0; i < 50; i++) target.fire('wheel', wheel(-100))
    expect(nav.getSpeed()).toBe(5)
    for (let i = 0; i < 100; i++) target.fire('wheel', wheel(100))
    expect(nav.getSpeed()).toBe(1)
  })

  // ── Teleport ──────────────────────────────────────────────────────────────
  it('glides to standing height above a double-clicked point', () => {
    nav.start()
    nav.walkTo({ x: 10, y: 0, z: -10 })
    run(2)
    expect(controls.look.px).toBeCloseTo(10, 1)
    expect(controls.look.py).toBeCloseTo(1.7, 1)   // standing on it, not lying on it
    expect(controls.look.pz).toBeCloseTo(-10, 1)
  })

  it('keeps the heading through a teleport', () => {
    nav.start()
    const headingBefore = Math.atan2(controls.look.tx - controls.look.px, controls.look.tz - controls.look.pz)
    nav.walkTo({ x: 8, y: 3, z: 8 })
    run(2)
    const headingAfter = Math.atan2(controls.look.tx - controls.look.px, controls.look.tz - controls.look.pz)
    expect(headingAfter).toBeCloseTo(headingBefore, 4)
  })

  it('hands control back the moment you touch a key mid-glide', () => {
    nav.start()
    nav.walkTo({ x: 100, y: 0, z: 0 })
    run(0.1)
    const interrupted = controls.look.px
    target.fire('keydown', key('KeyW'))
    run(1)
    target.fire('keyup', key('KeyW'))
    expect(controls.look.px).toBeCloseTo(interrupted, 1)   // stopped chasing X
    expect(Math.abs(controls.look.pz)).toBeGreaterThan(1)  // walked instead
  })

  it('ignores a teleport to nowhere', () => {
    nav.start()
    nav.walkTo({ x: Number.NaN, y: 0, z: 0 })
    run(1)
    expect(controls.look.px).toBe(0)
  })

  // ── State for the HUD ─────────────────────────────────────────────────────
  it('publishes state on every change the HUD renders', () => {
    nav.start()
    expect(states[states.length - 1]).toMatchObject({ active: true })
    target.fire('wheel', wheel(-100))
    expect(states[states.length - 1].speed).toBeGreaterThan(2)
    nav.stop()
    expect(states[states.length - 1]).toMatchObject({ active: false })
  })

  it('toggle reports the state it ended in', () => {
    expect(nav.toggle()).toBe(true)
    expect(nav.isActive()).toBe(true)
    expect(nav.toggle()).toBe(false)
  })

  it('dispose removes every listener and restores the button', () => {
    nav.start()
    nav.dispose()
    expect(controls.mouseButtons.left).toBe(ORBIT)
    for (const type of ['keydown', 'keyup', 'blur', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel']) {
      expect(target.count(type)).toBe(0)
    }
  })
})
