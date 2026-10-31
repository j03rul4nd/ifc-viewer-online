// ─── Who owns the pointers ────────────────────────────────────────────────────
// Pen, palm and fingers land on the same canvas. This state machine decides what
// each contact means and answers with actions; it knows nothing about the DOM.
//
//   pen            always draws, and from then on fingers only navigate
//   one finger     draws until a pen has been seen (or fingerDraw is switched off)
//   two fingers    orbit and pinch; a quick tap undoes
//   three fingers  pan; a quick tap redoes
//   four fingers   a quick tap hides or shows the interface
//   mouse          left draws, right orbits, middle pans
//   pen barrel     orbits, as a tablet's side button does in most software
//   held key       Space pans, Alt orbits, with whatever is pressed
//
// A two-finger gesture never lands on both fingers in the same millisecond, so
// the first finger's stroke is provisional: a second finger arriving soon after
// cancels it rather than leaving a dot on the drawing.

export type ContactKind = 'pen' | 'touch' | 'mouse'

export interface Contact {
  id: number
  kind: ContactKind
  x: number
  y: number
  timeMs: number
  /** Contact size in CSS px, where the device reports one. A palm is big. */
  size?: number
  /** MouseEvent.button */
  button?: number
  /** MouseEvent.buttons */
  buttons?: number
  /** A key held while this contact landed. */
  modifier?: 'orbit' | 'pan' | 'zoom'
}

export type GestureAction =
  | { type: 'draw-start'; contact: Contact }
  | { type: 'draw-move'; contact: Contact }
  | { type: 'draw-end' }
  | { type: 'draw-cancel' }
  | { type: 'orbit'; dx: number; dy: number }
  | { type: 'pan'; dx: number; dy: number }
  | { type: 'zoom'; factor: number; x: number; y: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'pen-detected' }
  | { type: 'toggle-ui' }

/** A finger landing this soon after the first turns the stroke into a gesture. */
export const CANCEL_WINDOW_MS = 160
/** A multi-finger tap: all up this soon, having barely moved. */
const TAP_MS = 260
const TAP_SLOP_PX = 14
/** Bigger than any fingertip reports; ignored once a pen is in use. */
const PALM_SIZE_PX = 44

type Mode = 'idle' | 'draw' | 'gesture' | 'mouse-orbit' | 'mouse-pan' | 'mouse-zoom'

export class GestureArbiter {
  private readonly touches = new Map<number, Contact>()
  private mode: Mode = 'idle'
  private drawer = -1
  private drawStart = 0
  private penSeen = false
  private peakFingers = 0
  private gestureStart = 0
  private gestureMoved = 0
  private lastDistance = 0
  private lastX = 0
  private lastY = 0
  private anchorY = 0

  /** Off once a pen appears. The user may also set it by hand. */
  fingerDraw = true

  get usingPen(): boolean { return this.penSeen }

  down(c: Contact): GestureAction[] {
    if (c.modifier) return this.navigate(c, c.modifier)
    if (c.kind === 'pen' && (c.button === 2 || ((c.buttons ?? 0) & 2) !== 0)) return [...this.notePen(), ...this.navigate(c, 'orbit')]
    if (c.kind === 'pen') return this.penDown(c)
    if (c.kind === 'mouse') return this.mouseDown(c)
    return this.touchDown(c)
  }

  move(c: Contact): GestureAction[] {
    if (c.id === this.drawer && this.mode === 'draw') return [{ type: 'draw-move', contact: c }]
    if (this.mode === 'mouse-zoom') {
      const dy = c.y - this.lastY
      this.lastY = c.y
      return [{ type: 'zoom', factor: Math.exp(-dy * 0.01), x: this.lastX, y: this.anchorY }]
    }
    if (this.mode === 'mouse-orbit' || this.mode === 'mouse-pan') {
      const dx = c.x - this.lastX
      const dy = c.y - this.lastY
      this.lastX = c.x
      this.lastY = c.y
      return [{ type: this.mode === 'mouse-orbit' ? 'orbit' : 'pan', dx, dy }]
    }
    if (c.kind !== 'touch' || !this.touches.has(c.id)) return []
    this.touches.set(c.id, c)
    return this.mode === 'gesture' ? this.gestureMove(c.timeMs) : []
  }

  up(c: Contact): GestureAction[] {
    if (c.id === this.drawer && this.mode === 'draw') {
      this.touches.delete(c.id)
      this.drawer = -1
      this.mode = 'idle'
      return [{ type: 'draw-end' }]
    }
    if (this.mode === 'mouse-orbit' || this.mode === 'mouse-pan' || this.mode === 'mouse-zoom') {
      this.mode = 'idle'
      return []
    }
    if (!this.touches.delete(c.id)) return []
    if (this.mode !== 'gesture') return []
    if (this.touches.size > 0) {
      // Re-anchor on who is left, so the fingers lifting do not jump the view.
      this.anchor()
      return []
    }
    this.mode = 'idle'
    const quick = c.timeMs - this.gestureStart < TAP_MS && this.gestureMoved < TAP_SLOP_PX
    if (!quick) return []
    if (this.peakFingers === 2) return [{ type: 'undo' }]
    if (this.peakFingers === 3) return [{ type: 'redo' }]
    if (this.peakFingers === 4) return [{ type: 'toggle-ui' }]
    return []
  }

  /** The system took the pointer (a notification, a fold): never commit half a stroke. */
  cancel(c: Pick<Contact, 'id'>): GestureAction[] {
    this.touches.delete(c.id)
    if (c.id === this.drawer && this.mode === 'draw') {
      this.drawer = -1
      this.mode = 'idle'
      return [{ type: 'draw-cancel' }]
    }
    if (this.touches.size === 0 && this.mode === 'gesture') this.mode = 'idle'
    if (this.mode === 'mouse-orbit' || this.mode === 'mouse-pan' || this.mode === 'mouse-zoom') this.mode = 'idle'
    return []
  }

  private notePen(): GestureAction[] {
    if (this.penSeen) return []
    this.penSeen = true
    this.fingerDraw = false
    return [{ type: 'pen-detected' }]
  }

  private navigate(c: Contact, how: 'orbit' | 'pan' | 'zoom'): GestureAction[] {
    this.mode = how === 'orbit' ? 'mouse-orbit' : how === 'pan' ? 'mouse-pan' : 'mouse-zoom'
    this.lastX = c.x
    this.lastY = c.y
    this.anchorY = c.y
    return []
  }

  private penDown(c: Contact): GestureAction[] {
    const out: GestureAction[] = this.notePen()
    // The hand landed first, as it does: the pen wins, whatever it was doing.
    if (this.mode === 'draw') out.push({ type: 'draw-cancel' })
    this.touches.clear()
    this.mode = 'draw'
    this.drawer = c.id
    this.drawStart = c.timeMs
    out.push({ type: 'draw-start', contact: c })
    return out
  }

  private mouseDown(c: Contact): GestureAction[] {
    if (c.button === 2 || c.button === 1) return this.navigate(c, c.button === 2 ? 'orbit' : 'pan')
    this.mode = 'draw'
    this.drawer = c.id
    this.drawStart = c.timeMs
    return [{ type: 'draw-start', contact: c }]
  }

  private touchDown(c: Contact): GestureAction[] {
    if (this.penSeen && (c.size ?? 0) > PALM_SIZE_PX) return []
    // A pen stroke is under way: the resting hand is not a command.
    if (this.mode === 'draw' && this.penSeen) return []
    this.touches.set(c.id, c)

    if (this.mode === 'draw') {
      if (c.timeMs - this.drawStart > CANCEL_WINDOW_MS) {
        // Well into a finger stroke: a stray touch changes nothing.
        this.touches.delete(c.id)
        return []
      }
      this.drawer = -1
      this.startGesture(c.timeMs)
      return [{ type: 'draw-cancel' }]
    }
    if (this.mode === 'gesture') {
      this.peakFingers = Math.max(this.peakFingers, this.touches.size)
      this.anchor()
      return []
    }
    if (this.touches.size >= 2) {
      this.startGesture(c.timeMs)
      return []
    }
    if (!this.fingerDraw) {
      // Fingers only navigate now, so one finger orbits rather than sitting idle.
      this.startGesture(c.timeMs)
      return []
    }
    this.mode = 'draw'
    this.drawer = c.id
    this.drawStart = c.timeMs
    return [{ type: 'draw-start', contact: c }]
  }

  private startGesture(timeMs: number): void {
    this.mode = 'gesture'
    this.gestureStart = timeMs
    this.gestureMoved = 0
    this.peakFingers = this.touches.size
    this.anchor()
  }

  private centroid(): { x: number; y: number; spread: number } {
    let x = 0
    let y = 0
    const all = [...this.touches.values()]
    for (const t of all) { x += t.x; y += t.y }
    x /= all.length || 1
    y /= all.length || 1
    let spread = 0
    for (const t of all) spread += Math.hypot(t.x - x, t.y - y)
    return { x, y, spread: spread / (all.length || 1) }
  }

  private anchor(): void {
    const c = this.centroid()
    this.lastX = c.x
    this.lastY = c.y
    this.lastDistance = c.spread
  }

  private gestureMove(_timeMs: number): GestureAction[] {
    const c = this.centroid()
    const dx = c.x - this.lastX
    const dy = c.y - this.lastY
    const out: GestureAction[] = []
    this.gestureMoved += Math.hypot(dx, dy) + Math.abs(c.spread - this.lastDistance)
    const fingers = this.touches.size
    if (fingers >= 3) {
      if (dx || dy) out.push({ type: 'pan', dx, dy })
    } else {
      if (dx || dy) out.push({ type: 'orbit', dx, dy })
      if (fingers === 2 && this.lastDistance > 1 && c.spread > 1 && c.spread !== this.lastDistance) {
        out.push({ type: 'zoom', factor: c.spread / this.lastDistance, x: c.x, y: c.y })
      }
    }
    this.lastX = c.x
    this.lastY = c.y
    this.lastDistance = c.spread
    return out
  }
}
