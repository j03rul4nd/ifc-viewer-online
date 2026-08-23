// ─── tree-seeding ─────────────────────────────────────────────────────────────
// Growing a canopy on a polygon that OSM only gave us an outline for.
//
// The gap this closes. Until now the only trees in the scene were `natural=tree`
// nodes — individual street trees somebody stood on the pavement and mapped, one
// at a time. A `landuse=forest` or `natural=wood` polygon got a green surface and
// nothing standing on it, so a wooded hillside rendered as baize. On a Kyoto site
// that is 205 greenery polygons against 555 mapped nodes: the slopes east of the
// city were carpet, and no amount of work on the grass shader was ever going to
// fix that, because the thing missing was not the colour of the ground. It was
// the trees.
//
// THREE RULES THE SEEDING OBEYS.
//
//   1. DETERMINISTIC. The same site grows the same forest, tree for tree, every
//      time — the rule the whole feature-variation module already follows, and
//      the reason a screenshot of this can be retaken tomorrow and match.
//
//   2. THINNED, NEVER TRUNCATED. When the instance budget cannot pay for every
//      tree, spacing widens across the whole layer instead of the list being cut
//      off. Same principle as the surface budget: a ceiling decides how DENSE
//      the world is, never which parts of it exist. Cutting the list would make
//      whichever wood Overpass happened to emit last disappear entirely.
//
//   3. THE TAG DECIDES THE PATTERN. An orchard is planted in rows and a wood is
//      not, and drawing both as scatter is the clearest possible statement that
//      nobody read the data. Rows are cheap to produce and enormously legible.
//
// PURE: rings of metres in, tree positions out. No THREE, no materials, no scene.

import { variate } from './feature-variation'
import { COVER_SPACING_M, COVER_TREE_SIZE, type GreenCover } from './osm-features'
import type { TreeShape } from './feature-variation'
import type { Vec2 } from './surface-tessellation'

/** One greenery polygon offered up for planting, in planar metres. */
export interface SeedRegion {
  /** Stable feature id — every jitter downstream is keyed off it. */
  id: string
  /** Closed ring, any winding. */
  ringM: ReadonlyArray<Vec2>
  cover: GreenCover
  shape: TreeShape
}

/** One planted tree, in the same metres the region was given in. */
export interface SeededTree {
  /** Unique and stable, so per-tree variation downstream is reproducible. */
  id: string
  x: number
  y: number
  heightM: number
  radiusM: number
  shape: TreeShape
  /**
   * How close to the edge of its mass this tree stands, 0 (deep inside) to 1
   * (on the boundary). What lets the edge be treated as an edge rather than as
   * a line where the trees stop.
   */
  edge: number
}

/**
 * How far into a mass the edge treatment reaches, in spacings.
 *
 * A forest does not fade out; it ends in a wall of vegetation that has grown
 * towards the light. Two spacings is enough to carry that without the interior
 * losing its own character.
 */
const EDGE_BAND_SPACINGS = 2

/** Below this a polygon is too small to plant without it reading as a clump. */
const MIN_PLANTABLE_M2 = 120

// ── Geometry helpers (local, so this module stays free of dependencies) ────────

/** Shoelace area of a ring, metres². Sign discarded. */
export function ringArea(ring: ReadonlyArray<Vec2>): number {
  if (ring.length < 3) return 0
  let twice = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    twice += (ring[j].x + ring[i].x) * (ring[j].y - ring[i].y)
  }
  return Math.abs(twice) / 2
}

function inside(px: number, py: number, ring: ReadonlyArray<Vec2>): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if ((a.y > py) !== (b.y > py)
      && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      hit = !hit
    }
  }
  return hit
}

/** Distance from a point to the nearest edge of a ring, metres. */
function distanceToEdge(px: number, py: number, ring: ReadonlyArray<Vec2>): number {
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    const vx = b.x - a.x
    const vy = b.y - a.y
    const len2 = vx * vx + vy * vy
    let t = len2 === 0 ? 0 : ((px - a.x) * vx + (py - a.y) * vy) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const d = Math.hypot(px - (a.x + t * vx), py - (a.y + t * vy))
    if (d < best) best = d
  }
  return best
}

/**
 * The direction a planted field runs in: the ring's own longest edge.
 *
 * Rows have to line up with the plot, not with north. An orchard whose rows run
 * diagonally across its own boundary looks like a texture, not like farming, and
 * the boundary is the only evidence we have of how the field was laid out.
 */
export function principalAxis(ring: ReadonlyArray<Vec2>): { cos: number; sin: number } {
  let bestLen = -1
  let cos = 1
  let sin = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const dx = ring[i].x - ring[j].x
    const dy = ring[i].y - ring[j].y
    const len = dx * dx + dy * dy
    if (len > bestLen && len > 0) {
      bestLen = len
      const d = Math.sqrt(len)
      cos = dx / d
      sin = dy / d
    }
  }
  return { cos, sin }
}

// ── Budget ─────────────────────────────────────────────────────────────────────

/**
 * How much of its natural density each region may have, 0-1.
 *
 * Shared out by AREA, which with an area-proportional natural count means every
 * region is thinned by the SAME factor — and that is the point: a copse denser
 * than the wood beside it reads as a bug, so the site thins as one. `weight` is
 * the lever for saying something else matters; the scene builder passes
 * proximity to the model, because the hero shot is around the model and the far
 * ridge can be thinner without anybody being able to tell.
 *
 * `naturalCount` must include EVERYTHING the caller will go on to plant for a
 * region — margins as well as interior — or the budget it returns is not the
 * budget that gets spent.
 *
 * Returns a density multiplier, not a count, because thinning is applied by
 * widening the spacing — see rule 2 at the top of this file.
 */
export function allocateDensity(
  regions: ReadonlyArray<{ id: string; areaM2: number; weight?: number }>,
  budget: number,
  naturalCount: (areaM2: number, id: string) => number,
): Map<string, number> {
  const out = new Map<string, number>()
  if (regions.length === 0 || budget <= 0) return out

  let wanted = 0
  for (const r of regions) wanted += naturalCount(r.areaM2, r.id)
  // Everything fits: nobody is thinned, and the result is identical whatever
  // the budget happens to be. Worth the branch — most sites are in this case.
  if (wanted <= budget) {
    for (const r of regions) out.set(r.id, 1)
    return out
  }

  // Weighted share of the budget, converted back into a density.
  let totalWeight = 0
  for (const r of regions) totalWeight += r.areaM2 * (r.weight ?? 1)
  for (const r of regions) {
    const natural = naturalCount(r.areaM2, r.id)
    if (natural <= 0) { out.set(r.id, 0); continue }
    const share = totalWeight > 0
      ? (budget * r.areaM2 * (r.weight ?? 1)) / totalWeight
      : budget / regions.length
    // No floor. A minimum density here would be a promise this function cannot
    // keep — on a site of forty large woods it lifts every region above its
    // share, the total overruns the ceiling, and the hard cap downstream then
    // truncates whichever woods came last. That is precisely the failure the
    // whole design exists to avoid, arriving through the guard meant to be kind.
    // Polygons genuinely too small to plant are rejected by area, in seedRegion.
    out.set(r.id, Math.min(1, share / natural))
  }
  return out
}

/** Trees a region of this area grows at full density, for a given spacing. */
export function naturalCountFor(areaM2: number, spacingM: number): number {
  if (!(spacingM > 0) || areaM2 <= 0) return 0
  return Math.floor(areaM2 / (spacingM * spacingM))
}

/** Perimeter of a ring, metres — what the edge fringe is priced against. */
export function ringPerimeter(ring: ReadonlyArray<Vec2>): number {
  if (ring.length < 2) return 0
  let total = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    total += Math.hypot(ring[i].x - ring[j].x, ring[i].y - ring[j].y)
  }
  return total
}

/**
 * Everything a region will plant at full density: interior AND margin.
 *
 * Both, because the budget has to price what actually gets spent. A long thin
 * park is mostly margin, and costing it by area alone underestimates it several
 * times over — which is how a ceiling turns back into a truncation.
 */
export function naturalTotalFor(
  areaM2: number, perimeterM: number, spacingM: number,
): number {
  if (!(spacingM > 0)) return 0
  return naturalCountFor(areaM2, spacingM)
    + Math.floor(Math.max(0, perimeterM) / (spacingM * 0.55))
}

// ── Seeding ────────────────────────────────────────────────────────────────────

export interface SeedOptions {
  /** 0-1 density multiplier from allocateDensity. Defaults to full. */
  density?: number
  /** Hard stop for one region, so a pathological ring cannot run away. */
  maxTrees?: number
}

/**
 * Plant one polygon.
 *
 * A JITTERED GRID rather than true Poisson-disc sampling. Poisson gives prettier
 * spacing statistics and costs a spatial index and a rejection loop per point;
 * on a canopy where every crown overlaps its neighbours anyway, nobody can tell
 * the difference, and a grid cell with one offset point inside it is O(cells)
 * with no allocation. What matters visually is that the offsets are large enough
 * to destroy the lattice — at ±0.42 of a cell they are.
 *
 * The orchard case does the opposite on purpose: a small jitter, on a grid
 * rotated into the plot's own axis, so the rows survive.
 */
export function seedRegion(region: SeedRegion, opts: SeedOptions = {}): SeededTree[] {
  const ring = region.ringM
  if (ring.length < 3) return []

  const base = COVER_SPACING_M[region.cover]
  const size = COVER_TREE_SIZE[region.cover]
  if (!(base > 0) || size.radiusM <= 0) return []

  const area = ringArea(ring)
  if (area < MIN_PLANTABLE_M2) return []

  // Thinning widens the spacing rather than dropping the tail of a list: half
  // the density is the same field at 1/sqrt(0.5) the spacing, everywhere.
  const density = Math.max(0, Math.min(1, opts.density ?? 1))
  if (density <= 0) return []
  const spacing = base / Math.sqrt(density)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of ring) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }

  const rows = region.cover === 'orchard'
  const axis = rows ? principalAxis(ring) : { cos: 1, sin: 0 }
  // Rows: 8 % of the spacing is enough to stop the trees looking stamped, and
  // little enough that the lines still read from the air. Scatter: 42 % is as
  // far as a point can move inside its own cell without crossing into the next.
  const wobble = rows ? 0.08 : 0.42
  const cap = opts.maxTrees ?? Number.POSITIVE_INFINITY

  // A rotated grid has to cover the bounding box's own diagonal, since the cells
  // no longer line up with it.
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const reach = Math.hypot(maxX - minX, maxY - minY) / 2 + spacing
  const steps = Math.ceil(reach / spacing)

  const out: SeededTree[] = []
  const edgeBand = spacing * EDGE_BAND_SPACINGS

  for (let iy = -steps; iy <= steps && out.length < cap; iy++) {
    for (let ix = -steps; ix <= steps && out.length < cap; ix++) {
      // The cell index IS the seed, so a tree keeps its identity when the
      // region is re-planted — and loses it when the spacing changes, which is
      // correct: at a different density it is a different tree.
      const id = `${region.id}@${ix},${iy}`
      const jx = (variate(id, 11) * 2 - 1) * wobble * spacing
      const jy = (variate(id, 12) * 2 - 1) * wobble * spacing

      // Lay the grid out along the plot's axis, then rotate the whole thing back
      // into world metres — so rows follow the field rather than the compass.
      const lx = ix * spacing + jx
      const ly = iy * spacing + jy
      const x = cx + lx * axis.cos - ly * axis.sin
      const y = cy + lx * axis.sin + ly * axis.cos

      if (x < minX || x > maxX || y < minY || y > maxY) continue
      if (!inside(x, y, ring)) continue

      const d = distanceToEdge(x, y, ring)
      const edge = edgeBand > 0 ? Math.max(0, Math.min(1, 1 - d / edgeBand)) : 0

      // Trees at the edge of a wood are shorter and rounder — they grew in the
      // open, against the light, and every real treeline shows it. It is also
      // what stops the boundary reading as a row of identical stems.
      const shrink = region.cover === 'forest' ? 1 - edge * 0.35 : 1 - edge * 0.15

      out.push({
        id,
        x,
        y,
        heightM: size.heightM * shrink * (0.72 + variate(id, 13) * 0.56),
        radiusM: size.radiusM * shrink * (0.78 + variate(id, 14) * 0.44),
        shape: region.shape,
        edge,
      })
    }
  }

  return out
}

/**
 * Low vegetation straddling the boundary of a mass.
 *
 * The problem this exists for: a park ends on a dead straight polygon edge
 * against the street, and that hard line is as loud a tell that the scene was
 * generated as any amount of uniform colour. Real greenery does not end on a
 * ruled line — it has a hedge, a scrubby margin, branches over the pavement.
 *
 * The fix is deliberately geometric rather than a shader: a band of small
 * crowns walked ALONG the boundary and pushed a little to either side of it, so
 * some of the vegetation overhangs the edge. It costs no new material and no
 * alpha, and it rides the same instanced meshes as everything else — the edge
 * stops being a line because something is standing across it.
 */
export function seedFringe(region: SeedRegion, opts: SeedOptions = {}): SeededTree[] {
  const ring = region.ringM
  if (ring.length < 3) return []
  // A pitch or a lawn has no margin worth drawing; a bare field genuinely does
  // end at its fence.
  if (region.cover === 'bare') return []

  const size = COVER_TREE_SIZE[region.cover]
  const density = Math.max(0, Math.min(1, opts.density ?? 1))
  if (density <= 0 || size.radiusM <= 0) return []

  // Tighter than inside — that is what a hedgerow is — but thinned by the SAME
  // factor as the interior. It is tempting to let the margin hold its density
  // when the middle gives way, since the boundary is the part the viewer stands
  // closest to; the cost of that is a fringe whose size the budget cannot
  // predict, and a budget that cannot predict its own spend truncates instead
  // of thinning. Predictable beats flattering.
  const step = COVER_SPACING_M[region.cover] * 0.55 / density
  const cap = opts.maxTrees ?? Number.POSITIVE_INFINITY

  const out: SeededTree[] = []
  let carry = 0

  for (let i = 0, j = ring.length - 1; i < ring.length && out.length < cap; j = i++) {
    const a = ring[j]
    const b = ring[i]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len = Math.hypot(dx, dy)
    if (len === 0) continue
    const ux = dx / len
    const uy = dy / len

    for (let d = carry; d < len && out.length < cap; d += step) {
      const id = `${region.id}~${j},${Math.round(d)}`
      // Straddle: most of it inside, some of it reaching over the line. The
      // asymmetry is what makes it read as overhang rather than as a wall.
      const across = (variate(id, 21) - 0.65) * size.radiusM * 1.6
      const along = (variate(id, 22) - 0.5) * step * 0.6
      out.push({
        id,
        x: a.x + ux * (d + along) - uy * across,
        y: a.y + uy * (d + along) + ux * across,
        // Margin growth is low and bushy whatever the mass behind it is.
        heightM: Math.min(size.heightM, 2.4) * (0.7 + variate(id, 23) * 0.7),
        radiusM: Math.max(1, size.radiusM * 0.42) * (0.75 + variate(id, 24) * 0.6),
        shape: region.shape,
        edge: 1,
      })
      carry = d + step - len
    }
  }

  return out
}
