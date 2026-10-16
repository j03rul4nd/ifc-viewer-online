// ─── platform ─────────────────────────────────────────────────────────────────
// The few places the app must know it runs on Apple's touch WebKit.

/** iOS / iPadOS Safari (iPadOS reports as Mac, but has touch points). */
export function isAppleTouch(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
