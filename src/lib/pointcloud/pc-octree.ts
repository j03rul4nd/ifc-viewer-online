// ─── pc-octree ────────────────────────────────────────────────────────────────
// Which COPC octree nodes should be resident, given where the camera is.
//
// Pure arithmetic — no three.js, no WASM, no File. That is deliberate: node
// selection is the part of streaming with actual judgement in it, and it is far
// easier to be sure of as a function from (nodes, camera, budget) to a set than
// as behaviour tangled up in a render loop.
//
// The policy, in one line: refine a node when its points would be spaced more
// than `maxSpacingPx` apart on screen, deepest-benefit-first, never a child
// without its parent, and never past the budget.

/** An octree key. COPC's `(level, x, y, z)`, where level 0 is the root cube. */
export interface OctreeKey {
  level: number
  x: number
  y: number
  z: number
}

export interface OctreeNode extends OctreeKey {
  /** Stable id — `level-x-y-z`, the same string COPC hierarchies use. */
  id: string
  pointCount: number
}

/** The root cube, straight out of the COPC info VLR. */
export interface OctreeRoot {
  center: { x: number; y: number; z: number }
  halfSize: number
  /** Point spacing at level 0, in file units. Halves with every level. */
  spacing: number
}

export interface NodeBounds {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
  center: { x: number; y: number; z: number }
  /** Half the cube's edge length. */
  halfSize: number
}

/** Everything the policy needs to know about the view. Frame-independent. */
export interface ViewState {
  /** Camera position in the SAME space the node bounds are in. */
  position: { x: number; y: number; z: number }
  /**
   * Pixels per unit of size at one unit of distance:
   *   viewportHeight / (2 · tan(fov / 2))
   * Precomputing it keeps this module free of camera objects.
   */
  projectionFactor: number
  /** Returns false for a node cube entirely outside the frustum. */
  isVisible?(bounds: NodeBounds): boolean
}

export interface SelectionOptions {
  /**
   * Refine while a node's on-screen point spacing exceeds this many pixels.
   * Larger = coarser and cheaper. ~2-4 px reads as a continuous surface.
   */
  maxSpacingPx: number
  /** Hard ceiling on resident points across the selection. */
  budget: number
}

export interface Selection {
  /** Node ids to have resident, in the order they should be fetched. */
  nodes: string[]
  /** Points those nodes hold in total. */
  pointCount: number
  /** True when the budget stopped the walk before the error target was met. */
  budgetLimited: boolean
}

export function keyId(key: OctreeKey): string {
  return `${key.level}-${key.x}-${key.y}-${key.z}`
}

/** The parent of a node, or null for the root. */
export function parentKey(key: OctreeKey): OctreeKey | null {
  if (key.level <= 0) return null
  return { level: key.level - 1, x: key.x >> 1, y: key.y >> 1, z: key.z >> 1 }
}

/**
 * The cube a key occupies. Each level halves the edge, and the key's x/y/z are
 * the cube's index along each axis at that level.
 */
export function nodeBounds(key: OctreeKey, root: OctreeRoot): NodeBounds {
  const size = (root.halfSize * 2) / Math.pow(2, key.level)
  const minX = root.center.x - root.halfSize + key.x * size
  const minY = root.center.y - root.halfSize + key.y * size
  const minZ = root.center.z - root.halfSize + key.z * size
  const half = size / 2
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: minX + size, y: minY + size, z: minZ + size },
    center: { x: minX + half, y: minY + half, z: minZ + half },
    halfSize: half,
  }
}

/** Point spacing inside a node, in file units. Halves with each level. */
export function nodeSpacing(level: number, root: OctreeRoot): number {
  return root.spacing / Math.pow(2, level)
}

/** Distance from a point to a node's cube — 0 when the point is inside it. */
export function distanceToBounds(p: { x: number; y: number; z: number }, b: NodeBounds): number {
  const dx = Math.max(b.min.x - p.x, 0, p.x - b.max.x)
  const dy = Math.max(b.min.y - p.y, 0, p.y - b.max.y)
  const dz = Math.max(b.min.z - p.z, 0, p.z - b.max.z)
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * How far apart this node's points would be on screen, in pixels.
 *
 * This is the quantity that actually matters: a node whose points land 20 px
 * apart looks like confetti and must be refined; one at half a pixel is wasting
 * the budget. Distance is measured to the CUBE, not its centre, so a large node
 * the camera sits inside scores as near rather than far.
 */
export function screenSpacingPx(node: OctreeKey, root: OctreeRoot, view: ViewState): number {
  const bounds = nodeBounds(node, root)
  const distance = distanceToBounds(view.position, bounds)
  const spacing = nodeSpacing(node.level, root)
  // Inside the node: treat as maximally urgent rather than dividing by zero.
  if (distance <= 1e-6) return Number.POSITIVE_INFINITY
  return (spacing / distance) * view.projectionFactor
}

/**
 * Choose the resident set.
 *
 * Walks the octree by descending "benefit" (on-screen spacing — the coarsest,
 * most visible thing first), admitting a node only once its parent is in. That
 * parent rule is not bureaucracy: COPC nodes each carry a *slice* of the points
 * in their cube, so a child without its ancestors renders a hole where the
 * coarse samples should be.
 */
export function selectNodes(
  nodes: OctreeNode[], root: OctreeRoot, view: ViewState, opts: SelectionOptions,
): Selection {
  const byId = new Map<string, OctreeNode>()
  for (const n of nodes) byId.set(n.id, n)

  const selected = new Set<string>()
  let pointCount = 0
  let budgetLimited = false

  // Start from the roots (level 0, or any node with no parent in the index).
  const queue: Array<{ node: OctreeNode; score: number }> = []
  const push = (node: OctreeNode): void => {
    queue.push({ node, score: screenSpacingPx(node, root, view) })
  }
  for (const n of nodes) {
    const parent = parentKey(n)
    if (!parent || !byId.has(keyId(parent))) push(n)
  }

  while (queue.length > 0) {
    // Highest on-screen spacing first: the node most in need of being drawn.
    queue.sort((a, b) => b.score - a.score)
    const { node, score } = queue.shift()!
    if (selected.has(node.id)) continue

    // A visible node whose points are already tighter than the target adds
    // nothing a viewer can see — and neither will its children.
    const bounds = nodeBounds(node, root)
    if (view.isVisible && !view.isVisible(bounds)) continue
    if (score < opts.maxSpacingPx && node.level > 0) continue

    if (pointCount + node.pointCount > opts.budget) {
      budgetLimited = true
      continue
    }
    selected.add(node.id)
    pointCount += node.pointCount

    // Only now are the children eligible — the parent rule, enforced by
    // construction rather than by a check.
    for (let i = 0; i < 8; i++) {
      const child = byId.get(keyId({
        level: node.level + 1,
        x: node.x * 2 + (i & 1),
        y: node.y * 2 + ((i >> 1) & 1),
        z: node.z * 2 + ((i >> 2) & 1),
      }))
      if (child && !selected.has(child.id)) push(child)
    }
  }

  // Fetch order: coarsest first, so the first thing on screen covers the whole
  // site and later arrivals only sharpen it.
  const ordered = [...selected].sort((a, b) => {
    const na = byId.get(a)!, nb = byId.get(b)!
    return na.level - nb.level ||
      screenSpacingPx(nb, root, view) - screenSpacingPx(na, root, view)
  })

  return { nodes: ordered, pointCount, budgetLimited }
}

/**
 * What to fetch and what to drop, given what is already resident. Keeping this
 * separate from selectNodes is what makes the streaming loop idempotent: it can
 * run every frame and will ask for nothing when the view has not moved.
 *
 * For the streaming loop proper, prefer `planResidency` — this one drops a node
 * the moment it leaves the selection, which thrashes on a camera that pans back
 * and forth across a node boundary.
 */
export function diffSelection(
  resident: Iterable<string>, selection: Selection,
): { load: string[]; evict: string[] } {
  const want = new Set(selection.nodes)
  const have = new Set(resident)
  return {
    load: selection.nodes.filter((id) => !have.has(id)),
    evict: [...have].filter((id) => !want.has(id)),
  }
}

// ── Residency, with hysteresis ─────────────────────────────────────────────────

export interface ResidencyState {
  /** Node ids currently on the GPU (or in flight). */
  resident: Iterable<string>
  /** Unwanted nodes being held on borrowed time: id → when they fell out. */
  deferred: ReadonlyMap<string, number>
  /** Points each resident node holds — needed to enforce the hard ceiling. */
  pointCounts: ReadonlyMap<string, number>
}

export interface ResidencyOptions {
  now: number
  /** How long an unwanted node is kept before it is actually dropped, ms. */
  graceMs: number
  /**
   * Points may exceed the render budget by this factor before grace is ignored
   * and the stalest nodes are dropped immediately. Hysteresis is a courtesy;
   * running out of VRAM is not.
   */
  overshoot: number
  /** The render budget the selection was made against. */
  budget: number
}

export interface ResidencyPlan {
  /** Fetch these. */
  load: string[]
  /** Drop these now. */
  evict: string[]
  /** Newly unwanted — start their clock at `now`. */
  defer: string[]
  /** Deferred but wanted again — cancel their clock, no refetch needed. */
  revive: string[]
}

/**
 * Decide what to load, hold and drop, with hysteresis.
 *
 * The problem this exists for: a camera nudged back and forth across a node
 * boundary makes a node leave and re-enter the selection every pass. Evicting on
 * the first frame it drops out means re-reading and re-decompressing it moments
 * later, forever. So an unwanted node is kept for `graceMs` first — if the view
 * comes back it costs nothing at all, and if it does not, it is dropped.
 *
 * The escape hatch matters as much as the grace: when held nodes push resident
 * points past `budget × overshoot`, the stalest are dropped immediately. A
 * smoothing heuristic must never be the reason a tab runs out of memory.
 */
export function planResidency(
  state: ResidencyState, selection: Selection, opts: ResidencyOptions,
): ResidencyPlan {
  const want = new Set(selection.nodes)
  const have = new Set(state.resident)

  const load = selection.nodes.filter((id) => !have.has(id))
  const revive = [...state.deferred.keys()].filter((id) => want.has(id))
  const defer = [...have].filter((id) => !want.has(id) && !state.deferred.has(id))

  const evict: string[] = []
  for (const [id, since] of state.deferred) {
    if (want.has(id)) continue                       // revived
    if (opts.now - since >= opts.graceMs) evict.push(id)
  }

  // Hard ceiling: count what would still be resident after the timed evictions,
  // and drop the stalest held nodes until it fits.
  const ceiling = opts.budget * opts.overshoot
  const evicting = new Set(evict)
  let residentPoints = 0
  for (const id of have) if (!evicting.has(id)) residentPoints += state.pointCounts.get(id) ?? 0
  for (const id of load) residentPoints += state.pointCounts.get(id) ?? 0

  if (residentPoints > ceiling) {
    const stalest = [...state.deferred.entries()]
      .filter(([id]) => !want.has(id) && !evicting.has(id))
      .sort((a, b) => a[1] - b[1])
    for (const [id] of stalest) {
      if (residentPoints <= ceiling) break
      evict.push(id)
      evicting.add(id)
      residentPoints -= state.pointCounts.get(id) ?? 0
    }
  }

  return { load, evict, defer, revive }
}
