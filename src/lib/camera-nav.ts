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
  mouseButtons: { left: A; middle: A }
}

type Listener = (event: Event) => void

/** The slice of `window` this module listens on. */
export interface NavKeyTarget {
  addEventListener(type: string, listener: Listener): void
  removeEventListener(type: string, listener: Listener): void
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
}

const WHEEL_BURST_WINDOW_MS = 160
const WHEEL_BURST_STEP = 0.22

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
    burstDollySpeed = 3.4,
    wheelTarget,
    smoothTime = 0.12,
    draggingSmoothTime = 0.065,
    restThreshold = 0.01,
    truckSpeed = 2,
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
  controls.infinityDolly = true

  // The CAD convention, and the one binding that is free here.
  controls.mouseButtons.middle = truckAction

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

    const directionalBase = direction > 0 ? outwardDollySpeed : dollySpeed
    controls.dollySpeed = Math.min(
      burstDollySpeed,
      directionalBase + (burstDollySpeed - directionalBase) * burst,
    )
  }

  // A pinch gesture does not emit wheel events on every platform. Do not let a
  // previous accelerated wheel-out speed leak into the next touch gesture.
  const onPointerDown = (): void => { controls.dollySpeed = dollySpeed }

  keyTarget.addEventListener('keydown', onKey)
  keyTarget.addEventListener('keyup', onKey)
  keyTarget.addEventListener('blur', onBlur)
  wheelTarget?.addEventListener('wheel', onWheel, true)
  wheelTarget?.addEventListener('pointerdown', onPointerDown, true)

  return () => {
    keyTarget.removeEventListener('keydown', onKey)
    keyTarget.removeEventListener('keyup', onKey)
    keyTarget.removeEventListener('blur', onBlur)
    wheelTarget?.removeEventListener('wheel', onWheel, true)
    wheelTarget?.removeEventListener('pointerdown', onPointerDown, true)
    release()
  }
}
