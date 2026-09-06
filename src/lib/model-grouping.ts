// ─── model-grouping ───────────────────────────────────────────────────────────
// WHICH LOADED FILES ARE ONE BUILDING.
//
// A federated delivery is one structure in several files — architecture,
// structure, MEP — and the scene has no idea. Load three files of the Hotel
// Vela, one of another Barcelona building and two of a third, and you get six
// equal rows. Moving the hotel then means moving three of them by hand and
// getting the same numbers into each, which nobody does correctly twice.
//
// ── The signal, and why not the obvious one ───────────────────────────────────
//
// The tempting rule is GEOGRAPHIC PROXIMITY: files near each other are the same
// building. It is wrong at exactly the scale this feature is for. Two buildings
// on the same block are forty metres apart and are not one delivery; the same
// threshold that joins a hotel's three files joins it to its neighbour.
//
// The signal that actually means "one delivery" is the file's own project
// identity. IFC states it: every file has an `IfcProject`, and a federated set
// is authored against one. That is what the ladder below reads.
//
// ── The ladder ────────────────────────────────────────────────────────────────
//
// Strongest evidence first, and the rung is reported so the UI can say how the
// grouping was arrived at rather than presenting a guess as a fact:
//
//   1. PROJECT GUID   — an IfcProject GlobalId shared by both files. Machine
//                       identity, authored deliberately. Nothing beats it.
//   2. PROJECT NAME   — the same project name and site name. Weaker, because a
//                       name is typed, but a real federation almost always
//                       agrees here even when tools mint different GUIDs.
//   3. SITE PROXIMITY — georeferences within a few metres AND no contradicting
//                       project identity. This is the fallback for files that
//                       carry coordinates and nothing else, and it is
//                       deliberately tight: metres, not the hundreds that would
//                       swallow the building next door.
//   4. NONE           — its own group of one. Not a failure: a single file of a
//                       single building is the ordinary case.
//
// A user override always wins over all four. No automatic rule is right every
// time, and the cost of being wrong is that someone cannot move their model.
//
// PURE: descriptors in, groups out. No store, no THREE, no React.

/** How near two files must be to be grouped on coordinates alone, metres. */
export const SITE_PROXIMITY_M = 25

/** How the members of a group were decided. */
export type GroupBasis = 'user' | 'projectGuid' | 'projectName' | 'proximity' | 'single'

/** Everything grouping reads about one loaded file. */
export interface ModelDescriptor {
  id: string
  fileName: string
  /** IfcProject GlobalId, when the file states one. */
  projectGuid?: string | null
  /** IfcProject Name, when the file states one. */
  projectName?: string | null
  /** IfcSite Name, when the file states one. */
  siteName?: string | null
  lat?: number | null
  lon?: number | null
  /** Group the user put this file in by hand. Beats every automatic rule. */
  userGroupId?: string | null
}

export interface ModelGroup {
  id: string
  /** Display name — the project name where there is one, else a shared prefix. */
  label: string
  memberIds: string[]
  basis: GroupBasis
}

/** Great-circle distance in metres. Small-angle safe, which is all this needs. */
function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180
  const dLat = (bLat - aLat) * toRad * 6_371_008.8
  const dLon = (bLon - aLon) * toRad * 6_371_008.8 * Math.cos(((aLat + bLat) / 2) * toRad)
  return Math.hypot(dLat, dLon)
}

const clean = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim()
  return t.length > 0 ? t : null
}

/**
 * The longest leading run two file names share, trimmed to a separator.
 *
 * Used only to LABEL a group that has no project name — never to form one.
 * Naming is a convention, and a convention is a good enough basis for a caption
 * and a poor one for deciding what moves together.
 */
export function sharedPrefix(names: ReadonlyArray<string>): string | null {
  if (names.length < 2) return null
  let end = 0
  const first = names[0]
  outer: for (let i = 0; i < first.length; i++) {
    for (const n of names) if (n[i] !== first[i]) break outer
    end = i + 1
  }
  const cut = first.slice(0, end).replace(/[\s\-_.]+$/, '')
  return cut.length >= 3 ? cut : null
}

/**
 * Partition loaded files into groups.
 *
 * Deterministic in input order: a group takes its id from its first member, so
 * the same scene always produces the same groups and a re-render never
 * reshuffles the tree under the user's cursor.
 */
export function groupModels(models: ReadonlyArray<ModelDescriptor>): ModelGroup[] {
  const byKey = new Map<string, { members: ModelDescriptor[]; basis: GroupBasis }>()

  const keyFor = (m: ModelDescriptor): { key: string; basis: GroupBasis } => {
    const user = clean(m.userGroupId)
    if (user) return { key: `user:${user}`, basis: 'user' }
    const guid = clean(m.projectGuid)
    if (guid) return { key: `guid:${guid}`, basis: 'projectGuid' }
    const project = clean(m.projectName)
    if (project) return { key: `name:${project}|${clean(m.siteName) ?? ''}`, basis: 'projectName' }
    return { key: '', basis: 'single' }
  }

  // Pass 1: everything with a stated identity.
  const unidentified: ModelDescriptor[] = []
  for (const m of models) {
    const { key, basis } = keyFor(m)
    if (!key) { unidentified.push(m); continue }
    const slot = byKey.get(key)
    if (slot) slot.members.push(m)
    else byKey.set(key, { members: [m], basis })
  }

  // Pass 2: the rest, joined only to each other and only when genuinely
  // co-located. Never joined into a named group — a file that states no project
  // must not be absorbed into one that does on the strength of being nearby.
  const proximityGroups: ModelDescriptor[][] = []
  for (const m of unidentified) {
    const here = m.lat != null && m.lon != null && Number.isFinite(m.lat) && Number.isFinite(m.lon)
    if (!here) { proximityGroups.push([m]); continue }
    const found = proximityGroups.find((g) => g.some((o) =>
      o.lat != null && o.lon != null
      && distanceM(o.lat, o.lon, m.lat!, m.lon!) <= SITE_PROXIMITY_M))
    if (found) found.push(m)
    else proximityGroups.push([m])
  }

  const out: ModelGroup[] = []
  for (const [, slot] of byKey) {
    const first = slot.members[0]
    out.push({
      id: `g-${first.id}`,
      label: clean(first.projectName)
        ?? sharedPrefix(slot.members.map((m) => m.fileName))
        ?? first.fileName,
      memberIds: slot.members.map((m) => m.id),
      basis: slot.members.length > 1 ? slot.basis : 'single',
    })
  }
  for (const g of proximityGroups) {
    out.push({
      id: `g-${g[0].id}`,
      label: sharedPrefix(g.map((m) => m.fileName)) ?? g[0].fileName,
      memberIds: g.map((m) => m.id),
      basis: g.length > 1 ? 'proximity' : 'single',
    })
  }

  // Input order, by each group's first member, so the tree is stable.
  const rank = new Map(models.map((m, i) => [m.id, i]))
  out.sort((a, b) => (rank.get(a.memberIds[0]) ?? 0) - (rank.get(b.memberIds[0]) ?? 0))
  return out
}

/** The group a model belongs to, or null when it is not in the list. */
export function groupOf(groups: ReadonlyArray<ModelGroup>, modelId: string): ModelGroup | null {
  return groups.find((g) => g.memberIds.includes(modelId)) ?? null
}

/**
 * Which models a move should apply to.
 *
 * THE WHOLE POINT OF THE FEATURE, and the reason it is a function rather than
 * an `if` at the call site: dragging a group moves every file in it by the SAME
 * delta, so their relative positions — which is what a federation IS — survive
 * the move. Dragging one member moves only that one, because a user who
 * selected one file meant one file.
 */
export function moveTargets(
  groups: ReadonlyArray<ModelGroup>, selectionId: string, scope: 'group' | 'model',
): string[] {
  if (scope === 'model') return [selectionId]
  const group = groups.find((g) => g.id === selectionId)
  if (group) return [...group.memberIds]
  return groupOf(groups, selectionId)?.memberIds.slice() ?? [selectionId]
}

// ── Identity from the spatial tree ────────────────────────────────────────────

/** The bit of a spatial node this module reads. Structural, to avoid a cycle. */
export interface TreeNodeLike {
  ifcClass: string
  globalId?: string
  name?: string
  children?: TreeNodeLike[]
}

export interface ModelIdentity {
  projectGuid: string | null
  projectName: string | null
  siteName: string | null
}

/**
 * Read a file's project and site identity out of its spatial tree.
 *
 * NO NEW EXTRACTION, deliberately. Every loaded model already gets a spatial
 * tree built for the validator, and an IFC spatial tree begins at IfcProject
 * and runs through IfcSite — which is exactly the identity grouping needs. A
 * second pass over the file with web-ifc to fetch two strings we are already
 * holding would be a worker, a message and a failure mode for nothing.
 *
 * Depth-first and first-match, because the tree is a containment hierarchy: the
 * first IfcProject encountered is the one the file is about. A file with no
 * tree yet — it is built in the background — answers all nulls, and grouping
 * simply falls to a weaker rung until it arrives.
 */
export function identityFromTree(
  nodes: ReadonlyArray<TreeNodeLike> | null | undefined,
): ModelIdentity {
  const out: ModelIdentity = { projectGuid: null, projectName: null, siteName: null }
  if (!nodes || nodes.length === 0) return out

  const walk = (list: ReadonlyArray<TreeNodeLike>): void => {
    for (const n of list) {
      const cls = (n.ifcClass ?? '').toUpperCase()
      if (cls === 'IFCPROJECT') {
        out.projectGuid ??= clean(n.globalId)
        out.projectName ??= clean(n.name)
      } else if (cls === 'IFCSITE') {
        out.siteName ??= clean(n.name)
      }
      // Stop as soon as both levels are answered: everything below a site is
      // buildings and storeys, and walking a whole model's tree for two strings
      // is work nobody asked for.
      if (out.projectGuid && out.siteName) return
      if (n.children && n.children.length > 0) walk(n.children)
    }
  }
  walk(nodes)
  return out
}
