/**
 * Mouse navigation bindings for the 3D scene.
 *
 * This lives outside `viewer.ts` because the interesting part is not the
 * three.js work — it is a small state machine over the left mouse button that
 * can get stuck, and a set of window listeners that have to come back off
 * again. Neither is reachable in a test while it sits inside viewer setup, and
 * the failure mode of both is silent: a viewer that pans when you meant to
 * orbit, or a dozen dead listeners holding dead controls after a few reloads.
 *
 * ── Why any of this is needed ────────────────────────────────────────────────
 * camera-controls maps right-drag to TRUCK (pan) by default, and this viewer
 * takes right-click for the element context menu — so the truck never got a
 * chance and THE SCENE HAD NO PAN AT ALL. That leaves left-drag to orbit and
 * the wheel to dolly, which makes the orbit target the only thing deciding
 * what you can look at, and the only thing that moved the target was framing an
 * element (which also flies you to it). With several models loaded that reads
 * as "I cannot get away from the one I focused", because you could not.
 */

/** The slice of camera-controls this module touches. */
export interface NavigableControls<A> {
  dollyToCursor: boolean
  dollySpeed: number
  truckSpeed: number
  smoothTime: number
  draggingSmoothTime: number
  restThreshold: number
  infinityDolly: boolean
  mouseButtons: { left: A; middle: A; right: A }
}

type Listener = (event: Event) => void

/** The slice of `window` this module listens on. */
export interface NavKeyTarget {
  addEventListener(type: string, listener: Listener, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: Listener, options?: boolean | EventListenerOptions): void
}

/** A capture listener is used so the speed is selected before camera-controls
 * consumes the same wheel event on the canvas. */
export interface NavWheelTarget {
  addEventListener(type: string, listener: Listener, options?: boolean | AddEventListenerOptions): void
  removeEventListener(type: string, listener: Listener, options?: boolean | EventListenerOptions): void
}

export interface NavOptions<A> {
  /** camera-controls' ACTION.TRUCK, i.e. pan. */
  truckAction: A
  /** Base wheel speed while approaching the cursor. */
  dollySpeed?: number
  /** Extra leverage when backing away from a close inspection. */
  outwardDollySpeed?: number
  /** Ceiling reached by a sustained wheel/trackpad gesture. */
  burstDollySpeed?: number
  /** DOM element that camera-controls listens to for wheel input. */
  wheelTarget?: NavWheelTarget
  /** Shorter values make camera motion settle sooner. */
  smoothTime?: number
  draggingSmoothTime?: number
  restThreshold?: number
  /** Building-scale pans should not require repeated long drags. */
  truckSpeed?: number
  /**
   * Pixels of right-button movement that turn a click into a drag.
   *
   * Right-DRAG pans and right-CLICK opens the element menu, which is what every
   * BIM viewer does and what stops the two competing for the same button. The
   * threshold is what separates them: a mouse always shifts a pixel or two
   * between press and release, so zero would eat every context menu.
   */
  rightDragThresholdPx?: number
}

const WHEEL_BURST_WINDOW_MS = 160
/**
 * How fast a sustained gesture reaches full speed. Raised from 0.22: crossing a
 * site meant a dozen unhurried wheel clicks before the ramp bit, which is the
 * span over which people give up and decide the zoom is slow.
 */
const WHEEL_BURST_STEP = 0.34

/**
 * Wire up panning, cursor-directed zoom and the Shift override.
 *
 * @returns a teardown that removes every listener AND restores the left button,
 *   so a viewer disposed mid-Shift does not hand its successor a stuck state.
 */
export function bindNavigation<A>(
  controls: NavigableControls<A>,
  keyTarget: NavKeyTarget,
  {
    truckAction,
    dollySpeed = 2,
    outwardDollySpeed = 2.6,
    burstDollySpeed = 5,
    wheelTarget,
    smoothTime = 0.12,
    draggingSmoothTime = 0.065,
    restThreshold = 0.01,
    truckSpeed = 2,
    rightDragThresholdPx = 4,
  }: NavOptions<A>,
): () => void {
  controls.dollyToCursor = true
  controls.dollySpeed = dollySpeed
  controls.truckSpeed = truckSpeed
  controls.smoothTime = smoothTime
  controls.draggingSmoothTime = draggingSmoothTime
  controls.restThreshold = restThreshold

  // Without this a dolly that reaches minDistance stops dead: the cursor is
  // over something ten metres further in and the wheel simply does nothing.
  // `infinityDolly` pushes the target ahead instead, so zooming in keeps going
  // for as long as you keep turning the wheel.
  //
  // It is turned OFF while zooming out, in the wheel handler below. The flag
  // cuts both ways: past maxDistance it drags the orbit target outward too, so
  // a sustained scroll-out walks the whole camera rig into empty space. Measured
  // on a 118 m model, thirty wheel clicks ended 3 900 km away with nothing on
  // screen and no way back but "reset view". Going in should be unbounded;
  // coming out should stop where the model is still in front of you.
  controls.infinityDolly = true

  // The CAD convention, and the one binding that was free here.
  controls.mouseButtons.middle = truckAction

  // RIGHT-DRAG PANS TOO — the binding people actually reach for.
  //
  // camera-controls maps right to truck by default and this viewer took the
  // button for its context menu, so pan was left on the middle button and a
  // Shift override. Plenty of people have neither: a trackpad, a Magic Mouse,
  // or simply the habit every other BIM tool has taught them. They orbit, find
  // the scene turning around one fixed point, and conclude the camera is stuck
  // on the model — because for them it is.
  //
  // Both can have the button: a drag pans, a click still opens the menu. The
  // contextmenu event is suppressed below when the press turned out to be a
  // drag, which is the same rule a text editor uses for click-versus-select.
  controls.mouseButtons.right = truckAction

  // Shift+left-drag also pans, for anyone without a middle button (laptops,
  // most mice under a trackpad driver, anyone on a Magic Mouse).
  //
  // `restore` doubles as the "is the override active" flag. It must only be
  // captured on the FIRST keydown: holding Shift auto-repeats keydown, and
  // re-capturing would save TRUCK as the thing to restore — leaving the viewer
  // permanently panning on left-drag with no way back.
  let restore: A | null = null

  const engage = (): void => {
    if (restore !== null) return
    restore = controls.mouseButtons.left
    controls.mouseButtons.left = truckAction
  }

  const release = (): void => {
    if (restore === null) return
    controls.mouseButtons.left = restore
    restore = null
  }

  const onKey = (event: Event): void => {
    if ((event as KeyboardEvent).key !== 'Shift') return
    if (event.type === 'keydown') engage()
    else release()
  }

  // A window that loses focus mid-drag never sees the keyup — alt-tab away
  // while panning and the left button would stay stuck on pan forever.
  const onBlur = (): void => { release() }

  // camera-controls uses a multiplicative dolly. That is ideal across scans of
  // wildly different scale, but a low constant speed makes backing out from a
  // close inspection feel much slower in world metres than approaching it.
  // Select the speed in capture phase, preserving camera-controls' own wheel
  // normalisation and dolly-to-cursor implementation.
  let lastWheelAt = Number.NEGATIVE_INFINITY
  let lastWheelDirection = 0
  let burst = 0
  const onWheel = (event: Event): void => {
    const wheel = event as WheelEvent
    const direction = Math.sign(wheel.deltaY)
    if (direction === 0) return

    const now = Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now()
    if (direction === lastWheelDirection && now - lastWheelAt <= WHEEL_BURST_WINDOW_MS) {
      burst = Math.min(1, burst + WHEEL_BURST_STEP)
    } else {
      burst = 0
    }
    lastWheelAt = now
    lastWheelDirection = direction

    // deltaY > 0 is backing away. Let the target run ahead only on the way IN.
    controls.infinityDolly = direction < 0

    const directionalBase = direction > 0 ? outwardDollySpeed : dollySpeed
    controls.dollySpeed = Math.min(
      burstDollySpeed,
      directionalBase + (burstDollySpeed - directionalBase) * burst,
    )
  }

  // A pinch gesture does not emit wheel events on every platform. Do not let a
  // previous accelerated wheel-out speed leak into the next touch gesture.
  const onPointerDown = (): void => {
    controls.dollySpeed = dollySpeed
    // A pinch may dolly in; leave the inward behaviour armed for it.
    controls.infinityDolly = true
  }

  // ── Right-drag pan vs right-click menu ──────────────────────────────────────
  // Tracked on the WINDOW in capture phase so the decision is made before the
  // canvas' own contextmenu listener runs, whatever order the two were bound
  // in. A drag that leaves the canvas still resolves, and a press that never
  // moves still gets its menu.
  let rightPress: { x: number; y: number } | null = null
  let rightDragged = false

  const onRightDown = (event: Event): void => {
    const e = event as PointerEvent
    if (e.button !== 2) return
    rightPress = { x: e.clientX, y: e.clientY }
    rightDragged = false
  }

  const onRightMove = (event: Event): void => {
    if (!rightPress || rightDragged) return
    const e = event as PointerEvent
    if (Math.hypot(e.clientX - rightPress.x, e.clientY - rightPress.y) > rightDragThresholdPx) {
      rightDragged = true
    }
  }

  // Marks the menu event WE raise, so our own capture listener lets it through.
  let synthetic = false

  /**
   * Swallow the platform's menu event entirely, and raise our own on release.
   *
   * Suppressing only "after a drag" is not portable: Windows and Linux fire
   * contextmenu on mouse UP, where the drag is already known, but macOS fires it
   * on mouse DOWN — before the user has moved a pixel. A menu would pop up at
   * the start of every pan there, which is worse than having no pan.
   *
   * So the native event never gets through, and a right press that turns out to
   * be a CLICK re-raises it on release. The viewer's own contextmenu handler
   * needs no knowledge of any of this.
   */
  const onContextMenu = (event: Event): void => {
    if (synthetic) return
    event.preventDefault()
    event.stopPropagation()
    ;(event as Event & { stopImmediatePropagation?: () => void }).stopImmediatePropagation?.()
  }

  const onRightUp = (event: Event): void => {
    const e = event as PointerEvent
    if (e.button !== 2) return
    const wasClick = rightPress !== null && !rightDragged
    rightPress = null
    rightDragged = false
    if (!wasClick) return

    const target = e.target as (EventTarget & { dispatchEvent?: (ev: Event) => boolean }) | null
    if (!target?.dispatchEvent || typeof MouseEvent === 'undefined') return
    synthetic = true
    try {
      target.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, button: 2,
      }))
    } finally {
      synthetic = false
    }
  }

  keyTarget.addEventListener('keydown', onKey)
  keyTarget.addEventListener('keyup', onKey)
  keyTarget.addEventListener('blur', onBlur)
  keyTarget.addEventListener('pointerdown', onRightDown)
  keyTarget.addEventListener('pointermove', onRightMove)
  keyTarget.addEventListener('pointerup', onRightUp)
  // Capture, so this runs before the canvas' own contextmenu handler no matter
  // which was bound first.
  keyTarget.addEventListener('contextmenu', onContextMenu, true)
  wheelTarget?.addEventListener('wheel', onWheel, true)
  wheelTarget?.addEventListener('pointerdown', onPointerDown, true)

  return () => {
    keyTarget.removeEventListener('keydown', onKey)
    keyTarget.removeEventListener('keyup', onKey)
    keyTarget.removeEventListener('blur', onBlur)
    keyTarget.removeEventListener('pointerdown', onRightDown)
    keyTarget.removeEventListener('pointermove', onRightMove)
    keyTarget.removeEventListener('pointerup', onRightUp)
    keyTarget.removeEventListener('contextmenu', onContextMenu, true)
    wheelTarget?.removeEventListener('wheel', onWheel, true)
    wheelTarget?.removeEventListener('pointerdown', onPointerDown, true)
    release()
  }
}
