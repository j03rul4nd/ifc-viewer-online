// ─── analytical solutions ─────────────────────────────────────────────────────
// Closed-form answers the solvers are checked against.

/**
 * Ritter (1892): instantaneous dam break over a dry, frictionless, horizontal
 * bed. Depth at x (m) and t (s) for a dam at x0 holding h0 to its left.
 */
export function ritterDepth(x: number, t: number, x0: number, h0: number, g = 9.81): number {
  if (t <= 0) return x <= x0 ? h0 : 0
  const c0 = Math.sqrt(g * h0)
  const xi = (x - x0) / t
  if (xi <= -c0) return h0
  if (xi >= 2 * c0) return 0
  const c = (2 * c0 - xi) / 3
  return (c * c) / g
}

/**
 * Kinematic wave, steady state on a plane under constant rain: discharge per
 * unit width at distance x from the divide is R·x, and Manning gives
 * h(x) = (n·R·x / √S)^(3/5).
 */
export function kinematicPlaneDepth(x: number, n: number, rainMs: number, slope: number): number {
  return Math.pow((n * rainMs * x) / Math.sqrt(slope), 0.6)
}

/** Time for a plane of length L to reach that steady state, s. */
export function kinematicEquilibriumTime(L: number, n: number, rainMs: number, slope: number): number {
  return Math.pow((L * n) / (Math.sqrt(slope) * Math.pow(rainMs, 2 / 3)), 0.6)
}
