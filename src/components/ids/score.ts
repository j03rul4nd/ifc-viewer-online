// ─── IDS score helpers ────────────────────────────────────────────────────────
// Shared score→color ramp (same thresholds as the Health Score chip).

export const SCORE_COLOR = (s: number): string =>
  (s >= 80 ? 'var(--ok)' : s >= 50 ? '#F5A623' : 'var(--danger)')
