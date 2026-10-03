// ─── keyboard-inset ──────────────────────────────────────────────────────────
// How much of the bottom of the screen the on-screen keyboard covers, as the
// CSS variable `--kb-inset` on <html>.
//
// iOS Safari does not resize the page when the keyboard opens: it lays the
// keyboard OVER the layout viewport. Anything fixed to the bottom — every
// bottom sheet and sheet-shaped dialog in this app — ends up behind it,
// including the very field being typed into. The visual viewport is the part
// still visible, so the covered strip is the layout height minus the visual
// viewport's bottom edge.
//
// Below 80 px it is the URL bar collapsing or expanding, not a keyboard, and is
// reported as 0 so sheets do not jump while the page scrolls.

const MIN_KEYBOARD_PX = 80

export function installKeyboardInset(): () => void {
  if (typeof window === 'undefined' || !window.visualViewport) return () => {}
  const vv = window.visualViewport
  const root = document.documentElement
  let last = -1
  let frame = 0

  const update = (): void => {
    frame = 0
    const covered = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)))
    const inset = covered >= MIN_KEYBOARD_PX ? covered : 0
    if (inset === last) return
    last = inset
    root.style.setProperty('--kb-inset', `${inset}px`)
    root.toggleAttribute('data-keyboard', inset > 0)
  }
  const schedule = (): void => { if (!frame) frame = requestAnimationFrame(update) }

  update()
  vv.addEventListener('resize', schedule)
  vv.addEventListener('scroll', schedule)
  return () => {
    vv.removeEventListener('resize', schedule)
    vv.removeEventListener('scroll', schedule)
    if (frame) cancelAnimationFrame(frame)
  }
}
