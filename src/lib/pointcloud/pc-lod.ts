// ─── pc-lod ───────────────────────────────────────────────────────────────────
// Distributes a global "points drawn this frame" budget across the visible
// chunks. Pure arithmetic — no three.js — so the policy is unit-testable
// independently of the renderer that applies it.
//
// The policy, in one line: a chunk gets a share of the budget proportional to
// how much of the screen it occupies, capped by how many points it actually
// has. Because every chunk's points are stored in random order (pc-chunker),
// "draw n of them" is a uniform subsample, so the result is a view-dependent
// density falloff with zero re-upload.

/** What the renderer measures for each resident chunk, once per LOD pass. */
export interface ChunkView {
  id: string
  /** Total points resident in this chunk. */
  count: number
  /** Distance from the camera to the chunk centre, scene metres. */
  distance: number
  /** Chunk bounding radius in scene metres. */
  radius: number
  /** False → outside the frustum; it draws nothing at all. */
  visible: boolean
}

export interface LodAllocation {
  /** chunk id → points to draw (0 = skip the draw call entirely). */
  draw: Map<string, number>
  /** Total points the frame will draw. */
  total: number
}

/** Never draw a visible chunk with fewer than this — a stippled ghost is worse than a sparse one. */
const MIN_CHUNK_POINTS = 1024

/**
 * Score = projected angular size. `radius / distance` is the tangent of the
 * half-angle the chunk subtends, which is exactly "how much screen it wants".
 * Guarded so a camera sitting inside a chunk does not produce Infinity.
 */
export function chunkScore(view: ChunkView): number {
  if (!view.visible || view.count <= 0) return 0
  const d = Math.max(view.distance, view.radius, 0.01)
  return view.radius / d
}

/**
 * Allocate `budget` points across the chunks.
 *
 * Two passes: hand every chunk its proportional share capped at its own count,
 * then redistribute whatever the caps left over. Without the second pass a
 * scene of mostly-tiny chunks would draw far below its budget for no reason.
 */
export function allocateBudget(views: ChunkView[], budget: number): LodAllocation {
  const draw = new Map<string, number>()
  if (budget <= 0 || views.length === 0) return { draw, total: 0 }

  const active: ChunkView[] = []
  for (const v of views) {
    if (v.visible && v.count > 0) active.push(v)
    else draw.set(v.id, 0)
  }
  if (active.length === 0) return { draw, total: 0 }

  const scores = active.map(chunkScore)
  const scoreSum = scores.reduce((a, b) => a + b, 0)

  // Degenerate case (every chunk scored 0): split evenly rather than blank out.
  if (scoreSum <= 0) {
    const even = Math.floor(budget / active.length)
    let total = 0
    for (const v of active) {
      const n = Math.min(v.count, Math.max(MIN_CHUNK_POINTS, even))
      draw.set(v.id, n)
      total += n
    }
    return { draw, total }
  }

  let remaining = budget
  const uncapped: Array<{ v: ChunkView; score: number }> = []
  let total = 0

  for (let i = 0; i < active.length; i++) {
    const v = active[i]
    const share = Math.floor((scores[i] / scoreSum) * budget)
    if (share >= v.count) {
      draw.set(v.id, v.count)
      remaining -= v.count
      total += v.count
    } else {
      uncapped.push({ v, score: scores[i] })
    }
  }

  if (uncapped.length > 0) {
    const sum = uncapped.reduce((a, u) => a + u.score, 0)
    for (const u of uncapped) {
      const raw = sum > 0 ? Math.floor((u.score / sum) * remaining) : Math.floor(remaining / uncapped.length)
      const n = Math.max(Math.min(MIN_CHUNK_POINTS, u.v.count), Math.min(u.v.count, raw))
      draw.set(u.v.id, n)
      total += n
    }
  }

  return { draw, total }
}

// ── When a LOD pass is due ─────────────────────────────────────────────────────

/**
 * What a LOD pass depends on about the camera: where it is, where it looks, and
 * how it projects. The camera's world matrix (16) then its projection (16).
 *
 * Position alone is not enough. Turning your head on the spot (walk mode, or an
 * orbit about the camera itself), zooming a lens or switching to orthographic
 * all change which chunks are in view without moving the camera an inch — and
 * a pass keyed on position left the chunks that had been culled out of view
 * hidden after they came back into it.
 */
export function viewSignature(
  matrixWorld: ArrayLike<number>, projection: ArrayLike<number>, out: number[] = [],
): number[] {
  out.length = 32
  for (let i = 0; i < 16; i++) out[i] = matrixWorld[i]
  for (let i = 0; i < 16; i++) out[16 + i] = projection[i]
  return out
}

/** Translation elements of a column-major 4×4: compared in metres, not as ratios. */
const TRANSLATION = new Set([12, 13, 14])

/**
 * True when two view signatures differ enough to change the draw selection:
 * 5 cm of travel, or ~0.006° of rotation / the equivalent change of lens.
 * An empty or mismatched `prev` always counts as moved.
 */
export function viewChanged(prev: ArrayLike<number> | null, next: ArrayLike<number>, moveEpsilon = 0.05): boolean {
  if (!prev || prev.length !== next.length) return true
  for (let i = 0; i < next.length; i++) {
    const a = prev[i]
    const b = next[i]
    if (!Number.isFinite(a) || !Number.isFinite(b)) return true
    const eps = i < 16 && TRANSLATION.has(i) ? moveEpsilon : 1e-4 * Math.max(1, Math.abs(b))
    if (Math.abs(a - b) > eps) return true
  }
  return false
}
