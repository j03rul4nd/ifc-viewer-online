// ─── platform ─────────────────────────────────────────────────────────────────
// The few places the app must know it runs on Apple's touch WebKit.

/** iOS / iPadOS Safari (iPadOS reports as Mac, but has touch points). */
export function isAppleTouch(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/**
 * Apple's WebKit: Safari on the Mac and every browser on iOS / iPadOS (they
 * all run WebKit). Chromium and Firefox also say "AppleWebKit"/"Safari" in
 * their user agent, so they are ruled out by name.
 */
export function isWebKit(): boolean {
  if (typeof navigator === 'undefined') return false
  if (isAppleTouch()) return true
  const ua = navigator.userAgent
  return /AppleWebKit/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS|Android/.test(ua)
}

/**
 * Options for fragments' worker pool. fragments starts a new worker for each
 * model until it reaches its cap (cores − 3, at least 2). In Safari on an
 * iPhone 14 (iOS 26.6), the second worker never answered: the first model
 * loaded, and the next ones stayed in "Scene creation" with no error.
 * On WebKit every model goes to the first worker, which works.
 *
 * fragments won't accept fewer than 2 workers, so the second slot is reserved
 * for a group that nothing loads into. That leaves the default pool with one
 * worker.
 */
export function fragmentsWorkerOptions(webkit: boolean): { maxWorkers: number; threadGroups: Record<string, number> } | undefined {
  return webkit ? { maxWorkers: 2, threadGroups: { unused: 1 } } : undefined
}
