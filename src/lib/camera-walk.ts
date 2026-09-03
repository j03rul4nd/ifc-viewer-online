/**
 * First-person walk navigation for the 3D scene.
 *
 * ── Why orbit alone is not enough ────────────────────────────────────────────
 * Everything else in this viewer orbits: the camera revolves around a target
 * and the wheel dollies towards it. That is the right tool for looking AT a
 * building and the wrong one for being INSIDE it. Walking a corridor with an
 * orbit rig means dollying in, discovering the target is behind the wall you
 * just passed through, re-centring, orbiting, dollying again — every metre. The
 * usual verdict is "the camera is stuck on the model", and it is: the orbit
 * target is the only thing that decides where you can look, and it never moves
 * on its own.
 *
 * So walk mode drives the camera directly. Position moves on the keyboard (or
 * an on-screen stick), direction on the mouse, and the orbit target is kept a
 * fixed short distance ahead of the eye — near enough that turning reads as
 * turning your head, far enough that camera-controls' own pan still works while
 * you are in there.
 *
 * ── The four things that decide whether it feels good ────────────────────────
 * Every walkthrough tool worth copying — Enscape, Twinmotion, Unreal's editor,
 * Matterport — agrees on these, and each was a separate bug report waiting to
 * happen here:
 *
 *  1. DAMPED MOVEMENT. A key that maps straight to a position delta starts and
 *     stops on the same frame; at building scale that reads as teleporting, and
 *     it is the single thing people mean by "it does not move smoothly". The
 *     velocity is eased towards the input instead (an exponential approach,
 *     frame-rate independent), so a tap glides and a release coasts.
 *  2. DAMPED LOOK. The same easing on yaw and pitch. Raw pointer deltas are
 *     quantised by the mouse's own report rate, and applying them unfiltered is
 *     what makes a turn feel like it is stepping rather than sweeping.
 *  3. UNLIMITED TURNING. Drag-to-look runs out of screen halfway through a
 *     180° turn, which is exactly the turn you make at the end of a corridor.
 *     Pointer Lock removes the edge of the window; it is opt-in because a
 *     captured cursor is a surprise if you did not ask for it.
 *  4. A WAY TO CROSS THE BUILDING. Walking from the lobby to a fifth-floor
 *     bathroom at 3 m/s is a minute of holding W. Two answers, both here: the
 *     wheel sets the walking speed (it is worthless as a dolly once you are
 *     inside), and double-clicking a surface glides you to standing height
 *     above it — the one interaction every point-cloud tour tool converged on,
 *     because it is aim-and-arrive with no piloting in between.
 *
 * ── And the one that decides whether anyone ever finds it ────────────────────
 * WASD MOVES WHETHER OR NOT THE MODE IS ON. Shipped without this, the first
 * thing a person does — press W, because every 3D tool made since 1996 walks on
 * W — did nothing at all, and the mode that would have made it work was behind
 * a button they had no reason to press. A control you must first discover
 * before the keys do anything is, for anyone who does not discover it, a
 * control that is not there. So the keys always drive the camera; walk mode
 * adds the mouse-look, the captured cursor, the wider lens and the HUD on top.
 *
 * Ambient movement is deliberately narrower than the mode: WASD and Q/E only.
 * The arrows and Space stay with the panels and the page, which is where a
 * person not in walk mode still expects them.
 *
 * Deliberately NOT here: collision and gravity. In a BIM review walking through
 * a wall is a feature — you are inspecting the wall — and a capsule collider
 * against fragments geometry (whose CPU vertex arrays are freed after upload)
 * would cost a raycast per frame to deliver being stuck in a doorway.
 *
 * ── Why this file is not inside viewer.ts ────────────────────────────────────
 * It is a state machine over held keys plus a pile of window listeners, both of
 * which fail silently — a key stuck down after an alt-tab walks the camera into
 * the next county, and listeners that never come off hold a dead camera alive
 * across reloads. Out here both are reachable from a test.
 */

export interface WalkVec { x: number; y: number; z: number }

/** The slice of camera-controls this module drives. */
export interface WalkControls<A> {
  getPosition(out?: WalkVec): WalkVec
  getTarget(out?: WalkVec): WalkVec
  setLookAt(
    px: number, py: number, pz: number,
    tx: number, ty: number, tz: number,
    enableTransition?: boolean,
  ): unknown
  mouseButtons: { left: A }
}

type Listener = (event: Event) => void

/** The slice of `window` / the canvas this module listens on. */
export interface WalkEventTarget {
  addEventListener(type: string, listener: Listener, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: Listener, options?: boolean | EventListenerOptions): void
  /** Present on real elements; absent in tests and on `window`. */
  requestPointerLock?: () => void
}

/** What the HUD needs to render, pushed on every change. */
export interface WalkState {
  active: boolean
  /** Metres per second at a walk, before sprint/creep. */
  speed: number
  pointerLocked: boolean
}

export interface WalkOptions<A> {
  /** camera-controls' ACTION.NONE — the left button is ours while walking. */
  noneAction: A
  /** Element the look-drag, the wheel and the pointer lock are read from. */
  pointerTarget?: WalkEventTarget
  /** Metres per second at a walk. Sprint and creep are multiples of it. */
  speed?: number
  /** Bounds for the wheel-driven speed adjustment. */
  minSpeed?: number
  maxSpeed?: number
  /** Held Shift. */
  sprintMultiplier?: number
  /** Held Alt — for threading a doorway. */
  creepMultiplier?: number
  /** Seconds for the velocity to close ~63% of the gap to the input. */
  accelTime?: number
  /** Seconds for the view to catch up with the pointer. 0 applies it raw. */
  lookSmoothing?: number
  /** Radians of turn per pixel dragged. */
  lookSensitivity?: number
  /** How far ahead of the eye the orbit target is parked, in metres. */
  eyeDistance?: number
  /** Where the eye stands above a surface you double-click onto. */
  eyeHeight?: number
  /** Seconds for a teleport to complete. Short enough to be quick, long enough
   *  to keep the room's geometry legible on the way — a cut loses the reader. */
  glideTime?: number
  /** Test seam. */
  now?: () => number
  requestFrame?: (cb: (t: number) => void) => number
  cancelFrame?: (handle: number) => void
  /** Fired whenever the camera actually moved, so the host can refresh fragments. */
  onMove?: () => void
  /** Fired on every state change the HUD renders. */
  onStateChange?: (state: WalkState) => void
  /** Reports whether the pointer is currently captured, for hosts with a DOM. */
  isPointerLocked?: () => boolean
  exitPointerLock?: () => void
}

export interface WalkNavigation {
  start(): void
  stop(): void
  toggle(): boolean
  isActive(): boolean
  getState(): WalkState
  setSpeed(metresPerSecond: number): void
  getSpeed(): number
  /**
   * Analog movement, each axis in [-1, 1], added to whatever the keys say.
   * This is how the on-screen stick drives the same rig as the keyboard —
   * there is no second movement path to keep in sync.
   */
  setMoveInput(forward: number, right: number, up?: number): void
  /** Turn by an explicit amount, in radians. Used by touch look. */
  look(yawDelta: number, pitchDelta: number): void
  /** Glide to standing height above a world point, keeping the current heading. */
  walkTo(point: WalkVec, standingHeight?: number): void
  /**
   * Let WASD / Q-E drive the camera even when walk mode is off — the keys
   * people press first, before they know the mode exists.
   */
  setAmbientMovement(on: boolean): void
  isAmbientMovement(): boolean
  /** Opt into a captured cursor, which is what makes a 180° turn possible. */
  setPointerLockEnabled(on: boolean): void
  isPointerLockEnabled(): boolean
  /** Advance one frame by hand. The rAF loop calls this; tests call it directly. */
  tick(dtSeconds: number): void
  dispose(): void
}

const MAX_PITCH = Math.PI / 2 - 0.01
/** A tab-out or a breakpoint must not hand the next frame a ten-second step. */
const MAX_STEP = 0.1
/** One wheel notch, as a ratio. Geometric, so the range is crossed in a flick
 *  from either end — the same reason the dolly is multiplicative. */
const SPEED_STEP = 1.18

/** Keys are read from `code`, so a French or German layout walks the same box. */
const FORWARD_KEYS = new Set(['KeyW', 'ArrowUp'])
const BACK_KEYS    = new Set(['KeyS', 'ArrowDown'])
const LEFT_KEYS    = new Set(['KeyA', 'ArrowLeft'])
const RIGHT_KEYS   = new Set(['KeyD', 'ArrowRight'])
const UP_KEYS      = new Set(['KeyE', 'Space', 'PageUp'])
const DOWN_KEYS    = new Set(['KeyQ', 'KeyC', 'PageDown'])

const MOVEMENT_KEYS = [FORWARD_KEYS, BACK_KEYS, LEFT_KEYS, RIGHT_KEYS, UP_KEYS, DOWN_KEYS]

/** What moves the camera with the mode OFF. Narrower on purpose: the arrows
 *  scroll the issue list and Space scrolls the page, and taking those from
 *  someone who never asked to walk would be a worse bug than the one this
 *  fixes. */
const AMBIENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE'])

function isMovementKey(code: string): boolean {
  return MOVEMENT_KEYS.some((set) => set.has(code))
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { isContentEditable?: boolean }) | null
  if (!el || typeof el.tagName !== 'string') return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * Bind walk navigation. Inert until `start()`; every listener stays bound for
 * the lifetime of the viewer so the mode can be toggled without re-wiring.
 */
export function bindWalkNavigation<A>(
  controls: WalkControls<A>,
  keyTarget: WalkEventTarget,
  {
    noneAction,
    pointerTarget = keyTarget,
    speed = 3.4,
    minSpeed = 0.3,
    maxSpeed = 60,
    sprintMultiplier = 3.2,
    creepMultiplier = 0.3,
    accelTime = 0.09,
    lookSmoothing = 0.045,
    lookSensitivity = 0.0032,
    eyeDistance = 1.5,
    eyeHeight = 1.65,
    glideTime = 0.32,
    now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    requestFrame,
    cancelFrame,
    onMove,
    onStateChange,
    isPointerLocked = () => (typeof document !== 'undefined' && document.pointerLockElement != null),
    exitPointerLock = () => { if (typeof document !== 'undefined') document.exitPointerLock?.() },
  }: WalkOptions<A>,
): WalkNavigation {
  const raf = requestFrame
    ?? ((cb: (t: number) => void) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : 0))
  const caf = cancelFrame
    ?? ((h: number) => { if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(h) })

  let active = false
  let walkSpeed = clamp(speed, minSpeed, maxSpeed)
  let restoreLeft: A | null = null
  let frame = 0
  let lastFrameAt = 0

  const held = new Set<string>()
  let sprint = false
  let creep  = false

  /** The analog stick, if there is one. Added to the keys, then clamped. */
  const analog = { forward: 0, right: 0, up: 0 }

  /** Look deltas still owed to the camera, in radians. Drained over time. */
  let pendingYaw = 0
  let pendingPitch = 0

  /** Smoothed world-space velocity, m/s. */
  const velocity = { x: 0, y: 0, z: 0 }

  /** Where a teleport is taking us, or null. Any key cancels it. */
  let glideTo: WalkVec | null = null

  let ambient = false
  let looking = false
  let lastPointer: { x: number; y: number } | null = null
  let lockEnabled = true
  let lockedNow = false

  const publish = (): void => {
    onStateChange?.({ active, speed: walkSpeed, pointerLocked: lockedNow })
  }

  const clearInput = (): void => {
    held.clear()
    sprint = false
    creep = false
    pendingYaw = 0
    pendingPitch = 0
    analog.forward = 0; analog.right = 0; analog.up = 0
    velocity.x = 0; velocity.y = 0; velocity.z = 0
    glideTo = null
    looking = false
    lastPointer = null
  }

  /** Read the eye and its heading; both are re-read every frame rather than
   *  cached, so a preset, a fit or a BCF viewpoint landing mid-walk is simply
   *  where you now stand — no snap back to a stale pose. */
  function readPose(): { pos: WalkVec; dir: WalkVec; distance: number } {
    const pos = controls.getPosition({ x: 0, y: 0, z: 0 })
    const tgt = controls.getTarget({ x: 0, y: 0, z: 0 })
    let x = tgt.x - pos.x, y = tgt.y - pos.y, z = tgt.z - pos.z
    const len = Math.hypot(x, y, z)
    if (!Number.isFinite(len) || len <= 0) return { pos, dir: { x: 0, y: 0, z: -1 }, distance: eyeDistance }
    return { pos, dir: { x: x / len, y: y / len, z: z / len }, distance: len }
  }

  /** Movement is live in walk mode and in ambient mode; everything else about
   *  walking — the look, the lock, the wheel, the teleport — is the mode only. */
  const movementLive = (): boolean => active || ambient

  /** The loop is only spun up while there is something to integrate, so ambient
   *  mode does not cost a frame callback for the whole session. */
  function ensureLoop(): void {
    if (frame !== 0 || !movementLive()) return
    lastFrameAt = 0
    frame = raf(loop)
  }

  function applyPose(pos: WalkVec, dir: WalkVec, distance: number, transition: boolean): void {
    controls.setLookAt(
      pos.x, pos.y, pos.z,
      pos.x + dir.x * distance, pos.y + dir.y * distance, pos.z + dir.z * distance,
      transition,
    )
  }

  // ── The frame ───────────────────────────────────────────────────────────────
  function tick(dt: number): void {
    if (!movementLive()) return
    const step = clamp(dt, 0, MAX_STEP)
    if (step <= 0) return

    const { pos, dir, distance } = readPose()
    let turned = false

    // ── Look ──────────────────────────────────────────────────────────────────
    // Drained rather than applied: the pointer reports in jumps (125 Hz mice,
    // trackpad gesture batching), and spending each jump over a few frames is
    // the difference between a sweep and a stutter.
    if (pendingYaw !== 0 || pendingPitch !== 0) {
      const drain = lookSmoothing > 0 ? 1 - Math.exp(-step / lookSmoothing) : 1
      const yawStep   = pendingYaw * drain
      const pitchStep = pendingPitch * drain
      pendingYaw   -= yawStep
      pendingPitch -= pitchStep
      if (Math.abs(pendingYaw) < 1e-6) pendingYaw = 0
      if (Math.abs(pendingPitch) < 1e-6) pendingPitch = 0

      const yaw = Math.atan2(dir.x, dir.z) + yawStep
      const rawPitch = Math.asin(clamp(dir.y, -1, 1)) + pitchStep
      const pitch = clamp(rawPitch, -MAX_PITCH, MAX_PITCH)
      // Looking further up than up is not a request to remember: without this
      // the overshoot queues, and the view refuses to come back down until the
      // debt is paid off.
      if (pitch !== rawPitch) pendingPitch = 0
      const cosPitch = Math.cos(pitch)
      dir.x = Math.sin(yaw) * cosPitch
      dir.y = Math.sin(pitch)
      dir.z = Math.cos(yaw) * cosPitch
      turned = true
    }

    // ── Which way is "forward" ────────────────────────────────────────────────
    // The horizontal projection of the view, not the view itself. Looking at
    // the floor while walking a corridor should still walk the corridor; with a
    // raw forward vector it drives you into the slab, which is the other half of
    // "I cannot get through the building".
    let fx = dir.x, fz = dir.z
    const flat = Math.hypot(fx, fz)
    if (flat < 1e-6) {
      const vFlat = Math.hypot(velocity.x, velocity.z)
      if (vFlat > 1e-6) { fx = velocity.x / vFlat; fz = velocity.z / vFlat } else { fx = 0; fz = -1 }
    } else {
      fx /= flat; fz /= flat
    }
    // right = forward × up
    const rx = -fz, rz = fx

    let forwardAxis = analog.forward
    let rightAxis   = analog.right
    let upAxis      = analog.up
    for (const code of held) {
      if (FORWARD_KEYS.has(code)) forwardAxis += 1
      else if (BACK_KEYS.has(code)) forwardAxis -= 1
      else if (RIGHT_KEYS.has(code)) rightAxis += 1
      else if (LEFT_KEYS.has(code)) rightAxis -= 1
      else if (UP_KEYS.has(code)) upAxis += 1
      else if (DOWN_KEYS.has(code)) upAxis -= 1
    }
    forwardAxis = clamp(forwardAxis, -1, 1)
    rightAxis   = clamp(rightAxis, -1, 1)
    upAxis      = clamp(upAxis, -1, 1)

    const ax = fx * forwardAxis + rx * rightAxis
    const az = fz * forwardAxis + rz * rightAxis
    const ay = upAxis

    const mag = Math.hypot(ax, ay, az)
    let desiredX = 0, desiredY = 0, desiredZ = 0
    if (mag > 1e-4) {
      // Clamp the magnitude, do not normalise it. Normalising stops a diagonal
      // being 41% faster than a straight line — the oldest bug in first-person
      // movement — but it would also make a stick pushed halfway run at a full
      // sprint, which is the whole point of having a stick.
      const throttle = Math.min(1, mag) / mag
      const s = walkSpeed * (sprint ? sprintMultiplier : 1) * (creep ? creepMultiplier : 1) * throttle
      desiredX = ax * s; desiredY = ay * s; desiredZ = az * s
      glideTo = null   // any input cancels a teleport still in flight
    }

    // Exponential approach: same feel at 30 fps as at 144.
    const k = accelTime > 0 ? 1 - Math.exp(-step / accelTime) : 1
    velocity.x += (desiredX - velocity.x) * k
    velocity.y += (desiredY - velocity.y) * k
    velocity.z += (desiredZ - velocity.z) * k
    if (Math.hypot(velocity.x, velocity.y, velocity.z) < 1e-4) {
      velocity.x = 0; velocity.y = 0; velocity.z = 0
    }

    let mx = velocity.x * step, my = velocity.y * step, mz = velocity.z * step

    // ── Teleport ──────────────────────────────────────────────────────────────
    if (glideTo) {
      const g = glideTime > 0 ? 1 - Math.exp(-step / glideTime) : 1
      const dxg = glideTo.x - pos.x, dyg = glideTo.y - pos.y, dzg = glideTo.z - pos.z
      if (Math.hypot(dxg, dyg, dzg) < 0.02) {
        mx = dxg; my = dyg; mz = dzg
        glideTo = null
      } else {
        mx = dxg * g; my = dyg * g; mz = dzg * g
      }
    }

    const moved = mx !== 0 || my !== 0 || mz !== 0
    if (!moved && !turned) return

    // Walking parks the target at arm's length; ambient movement must not touch
    // it. Shortening the orbit radius behind someone who only pressed W would
    // leave their next drag spinning around their own face.
    applyPose(
      { x: pos.x + mx, y: pos.y + my, z: pos.z + mz },
      dir,
      active ? eyeDistance : distance,
      false,
    )
    onMove?.()
  }

  /** Walk mode holds the loop open (the pointer can turn the view at any
   *  moment). Ambient movement only owes a frame while something is still
   *  moving, so the loop shuts itself down between key presses instead of
   *  costing a callback for the whole session. */
  const stillMoving = (): boolean =>
    held.size > 0 || glideTo !== null ||
    Math.hypot(velocity.x, velocity.y, velocity.z) > 1e-4

  const loop = (): void => {
    if (!movementLive()) { frame = 0; return }
    const t = now()
    const dt = lastFrameAt === 0 ? 1 / 60 : (t - lastFrameAt) / 1000
    lastFrameAt = t
    tick(dt)
    if (!active && !stillMoving()) { frame = 0; return }
    frame = raf(loop)
  }

  // ── Listeners ───────────────────────────────────────────────────────────────
  const onKeyDown = (event: Event): void => {
    if (!movementLive()) return
    const e = event as KeyboardEvent
    if (e.ctrlKey || e.metaKey) return
    if (isTypingTarget(e.target)) return
    sprint = e.shiftKey
    creep  = e.altKey
    if (!isMovementKey(e.code)) return
    if (!active && !AMBIENT_KEYS.has(e.code)) return
    // Space scrolls the page and the arrows scroll the panel behind the canvas.
    e.preventDefault()
    held.add(e.code)
    ensureLoop()
  }

  const onKeyUp = (event: Event): void => {
    if (!movementLive()) return
    const e = event as KeyboardEvent
    sprint = e.shiftKey
    creep  = e.altKey
    held.delete(e.code)
  }

  // A window that loses focus never sees the keyup: without this, alt-tabbing
  // mid-stride leaves the camera walking away for as long as the tab lives.
  const onBlur = (): void => { clearInput() }

  const onPointerDown = (event: Event): void => {
    if (!active) return
    const e = event as PointerEvent
    if (e.button !== 0 || e.shiftKey || e.ctrlKey || e.metaKey) return
    // Touch drives the on-screen stick and its own look handler; capturing the
    // cursor for a finger is meaningless and breaks the stick.
    if (lockEnabled && e.pointerType !== 'touch' && pointerTarget.requestPointerLock) {
      try { pointerTarget.requestPointerLock() } catch { /* denied — drag-look still works */ }
    }
    looking = true
    lastPointer = { x: e.clientX, y: e.clientY }
  }

  const onPointerMove = (event: Event): void => {
    if (!active) return
    const e = event as PointerEvent & { movementX?: number; movementY?: number }
    // Locked: there is no cursor to follow, only deltas — and no button to
    // hold, which is the whole point of locking.
    if (lockedNow) {
      pendingYaw   -= (e.movementX ?? 0) * lookSensitivity
      pendingPitch -= (e.movementY ?? 0) * lookSensitivity
      return
    }
    if (!looking || !lastPointer) return
    pendingYaw   -= (e.clientX - lastPointer.x) * lookSensitivity
    pendingPitch -= (e.clientY - lastPointer.y) * lookSensitivity
    lastPointer = { x: e.clientX, y: e.clientY }
  }

  const onPointerUp = (): void => {
    looking = false
    lastPointer = null
  }

  /** Wheel events over the canvas, as opposed to over a scrolling panel. */
  const overViewport = (event: Event): boolean =>
    pointerTarget === keyTarget || event.target === (pointerTarget as unknown as EventTarget)

  // The wheel is worthless as a dolly once you are standing in a room — the
  // camera is already where it needs to be, and dollying just breaks the eye
  // line. Every walkthrough tool spends it on speed instead, so this one does.
  //
  // Listened for on the WINDOW in capture phase, not on the canvas: camera-
  // controls and the orbit-speed tuning both bind to the canvas and both were
  // registered before this, so a canvas listener runs after them and the wheel
  // would set the speed AND dolly on the same notch. Capturing at the window is
  // the only place upstream of all three. It is scoped to wheel events over the
  // viewport, so the issue list behind it still scrolls.
  const onWheel = (event: Event): void => {
    if (!active || !overViewport(event)) return
    const e = event as WheelEvent
    const direction = Math.sign(e.deltaY)
    if (direction === 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
    walkSpeed = clamp(
      direction < 0 ? walkSpeed * SPEED_STEP : walkSpeed / SPEED_STEP,
      minSpeed, maxSpeed,
    )
    publish()
  }

  const onLockChange = (): void => {
    const locked = isPointerLocked()
    if (locked === lockedNow) return
    lockedNow = locked
    // Leaving the lock (Escape, alt-tab) must not leave a half-held drag behind.
    if (!locked) { looking = false; lastPointer = null }
    publish()
  }

  keyTarget.addEventListener('keydown', onKeyDown)
  keyTarget.addEventListener('keyup', onKeyUp)
  keyTarget.addEventListener('blur', onBlur)
  pointerTarget.addEventListener('pointerdown', onPointerDown)
  keyTarget.addEventListener('wheel', onWheel, { capture: true, passive: false })
  // Move and up go on the key target (the window) so a drag that leaves the
  // canvas keeps turning and always ends.
  keyTarget.addEventListener('pointermove', onPointerMove)
  keyTarget.addEventListener('pointerup', onPointerUp)
  keyTarget.addEventListener('pointercancel', onPointerUp)
  keyTarget.addEventListener('pointerlockchange', onLockChange)
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerlockchange', onLockChange)
  }

  function start(): void {
    if (active) return
    active = true
    clearInput()
    // Left-drag is the look, so camera-controls must stop orbiting on it. Pan
    // (middle / right / Shift+left) is deliberately left alone: sidestepping
    // without turning is useful from inside a room.
    restoreLeft = controls.mouseButtons.left
    controls.mouseButtons.left = noneAction

    // Pull the orbit target in to arm's length. Everything downstream — our own
    // turning, camera-controls' pan — measures from it, and left out at the
    // last framed element the first turn would swing you across the building.
    const { pos, dir } = readPose()
    applyPose(pos, dir, eyeDistance, false)

    if (frame !== 0) { caf(frame); frame = 0 }
    ensureLoop()
    publish()
  }

  function stop(): void {
    if (!active) return
    active = false
    caf(frame)
    frame = 0
    clearInput()
    if (restoreLeft !== null) {
      controls.mouseButtons.left = restoreLeft
      restoreLeft = null
    }
    if (lockedNow) { try { exitPointerLock() } catch { /* already released */ } }
    // Push the orbit target back out to a workable radius, or the orbit you
    // return to spins around a point 1.5 m from your face.
    const { pos, dir } = readPose()
    applyPose(pos, dir, Math.max(eyeDistance, 12), true)
    publish()
  }

  return {
    start,
    stop,
    toggle(): boolean { if (active) stop(); else start(); return active },
    isActive(): boolean { return active },
    getState(): WalkState { return { active, speed: walkSpeed, pointerLocked: lockedNow } },
    setSpeed(metresPerSecond: number): void {
      if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) return
      walkSpeed = clamp(metresPerSecond, minSpeed, maxSpeed)
      publish()
    },
    getSpeed(): number { return walkSpeed },
    setMoveInput(forward: number, right: number, up = 0): void {
      analog.forward = clamp(Number.isFinite(forward) ? forward : 0, -1, 1)
      analog.right   = clamp(Number.isFinite(right) ? right : 0, -1, 1)
      analog.up      = clamp(Number.isFinite(up) ? up : 0, -1, 1)
    },
    look(yawDelta: number, pitchDelta: number): void {
      if (!active) return
      if (Number.isFinite(yawDelta)) pendingYaw += yawDelta
      if (Number.isFinite(pitchDelta)) pendingPitch += pitchDelta
    },
    walkTo(point: WalkVec, standingHeight = eyeHeight): void {
      if (!active) return
      if (![point.x, point.y, point.z].every(Number.isFinite)) return
      // Standing height above the surface, not at it: arriving with the eye on
      // the floor is the same view as lying on it.
      glideTo = { x: point.x, y: point.y + standingHeight, z: point.z }
    },
    setAmbientMovement(on: boolean): void {
      ambient = on
      if (!on && !active) {
        held.clear()
        velocity.x = 0; velocity.y = 0; velocity.z = 0
        if (frame !== 0) { caf(frame); frame = 0 }
      }
    },
    isAmbientMovement(): boolean { return ambient },
    setPointerLockEnabled(on: boolean): void {
      lockEnabled = on
      if (!on && lockedNow) { try { exitPointerLock() } catch { /* already released */ } }
      publish()
    },
    isPointerLockEnabled(): boolean { return lockEnabled },
    tick,
    dispose(): void {
      stop()
      keyTarget.removeEventListener('keydown', onKeyDown)
      keyTarget.removeEventListener('keyup', onKeyUp)
      keyTarget.removeEventListener('blur', onBlur)
      pointerTarget.removeEventListener('pointerdown', onPointerDown)
      keyTarget.removeEventListener('wheel', onWheel, true)
      keyTarget.removeEventListener('pointermove', onPointerMove)
      keyTarget.removeEventListener('pointerup', onPointerUp)
      keyTarget.removeEventListener('pointercancel', onPointerUp)
      keyTarget.removeEventListener('pointerlockchange', onLockChange)
      if (typeof document !== 'undefined') {
        document.removeEventListener('pointerlockchange', onLockChange)
      }
    },
  }
}
