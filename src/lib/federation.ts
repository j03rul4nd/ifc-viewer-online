// ─── Federation: controlling many files as one coordinated set ───────────────
// Pure helpers behind the Scene panel's federation bar. A coordinator with an
// architecture, a structure and three MEP files open wants to answer "where
// does the duct hit the beam" — that means telling the files apart at a
// glance (discipline colour), seeing through some of them (ghosting), flipping
// whole disciplines on and off, and getting back to the same combination
// tomorrow (saved views). None of it touches the geometry or the files.

export type Discipline = 'A' | 'S' | 'M' | 'E' | 'P' | 'F' | 'C' | 'L' | 'X'

/** Display order — the order coordination meetings walk the set in. */
export const DISCIPLINES: Discipline[] = ['A', 'S', 'M', 'E', 'P', 'F', 'C', 'L', 'X']

/** One colour per discipline, distinct on a dark and a light background. */
export const DISCIPLINE_COLORS: Record<Discipline, string> = {
  A: '#d8d2c4', // architecture — warm off-white, the "base" everything sits in
  S: '#e07a5f', // structure — terracotta
  M: '#3d9be9', // mechanical / HVAC — blue
  E: '#f2c14e', // electrical — yellow
  P: '#4cc38a', // plumbing / drainage — green
  F: '#e0523f', // fire protection — red
  C: '#a07855', // civil / site — earth
  L: '#7bb662', // landscape — leaf
  X: '#9b8afb', // anything else — violet
}

// ISO 19650 / BS 1192 role codes appear as a field of the file name:
// PRJ-ORG-ZZ-XX-M3-A-0001.ifc. Words cover the files nobody named by the book.
const ROLE_CODE: Record<string, Discipline> = {
  A: 'A', S: 'S', M: 'M', E: 'E', P: 'P', F: 'F', C: 'C', L: 'L',
  H: 'M', // ISO "H" = heating & ventilation
  D: 'P', // drainage
  W: 'C', // civil
}

const WORDS: Array<[RegExp, Discipline]> = [
  [/(arq|arch|archi|architect|architettur|architektur|建筑|建築)/i, 'A'],
  [/(estruct|struct|strut|tragwerk|statik|結構|结构|構造)/i, 'S'],
  [/(hvac|mech|mec[aá]n|clima|vent|lüftung|heiz|空调|空調|設備)/i, 'M'],
  [/(elec|eléc|elett|elektr|lighting|ilumin|电气|電気)/i, 'E'],
  [/(plumb|fontan|sanit|drain|saneam|water|agua|sanitär|给排水|衛生)/i, 'P'],
  [/(fire|incend|sprink|pci|brand|消防)/i, 'F'],
  [/(civil|site|urban|terrain|topo|road|vial)/i, 'C'],
  [/(landsc|paisaj|jard[ií]n|garden|landschaft|景观)/i, 'L'],
  [/\bmep\b/i, 'M'],
]

/**
 * The discipline a file name declares, or 'X' when it declares none.
 *
 * A single-letter field between separators wins over words: in
 * "HV-ARQ-ZZ-M3-S-001" the S is the role and ARQ the originator.
 */
export function detectDiscipline(fileName: string): Discipline {
  const stem = fileName.replace(/\.[a-z0-9]+$/i, '')
  const fields = stem.split(/[-_.\s]+/).filter(Boolean)
  // Scan from the end: the role field sits after project/originator/zone.
  for (let i = fields.length - 1; i >= 1; i--) {
    const f = fields[i]
    if (f.length === 1 && /[A-Z]/.test(f) && ROLE_CODE[f]) return ROLE_CODE[f]
  }
  for (const [re, d] of WORDS) if (re.test(stem)) return d
  return 'X'
}

/** Clamp an opacity to what the viewer accepts (0.02–1). */
export const clampOpacity = (o: number): number => Math.max(0.02, Math.min(1, Number.isFinite(o) ? o : 1))

/** Case- and accent-insensitive model filter for long federations. */
export function matchesQuery(fileName: string, query: string): boolean {
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = norm(query.trim())
  if (!q) return true
  return q.split(/\s+/).every((part) => norm(fileName).includes(part))
}

// ── Saved views ──────────────────────────────────────────────────────────────
// Stored by FILE NAME, not model id: ids change on every load, the file names
// of a project do not. A view applies to whichever of its files are open.

export interface FederationView {
  id: string
  name: string
  /** file name → visible */
  visible: Record<string, boolean>
  /** file name → opacity (absent = 1) */
  opacity: Record<string, number>
  colorByDiscipline: boolean
  createdAt: number
  /** Where the camera stood (scene axes). Absent on views saved before cameras were kept. */
  camera?: ViewCamera
  /** Section planes on when saved (absent = leave the current cuts alone). */
  sections?: ViewSection[]
}

export type Vec3Tuple = [number, number, number]
export interface ViewCamera { position: Vec3Tuple; target: Vec3Tuple; projection: 'perspective' | 'orthographic' }
export interface ViewSection { point: Vec3Tuple; normal: Vec3Tuple }
/** Camera and cuts of the viewer right now, as a view keeps them. */
export interface ViewLook { camera?: ViewCamera; sections?: ViewSection[] }

/** Same bound the .ifcfed.json parser applies to a view's section planes. */
export const MAX_VIEW_SECTIONS = 12
const finite = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v)
const isVec3T = (v: unknown): v is Vec3Tuple => Array.isArray(v) && v.length === 3 && v.every(finite)
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function isViewCamera(c: unknown): c is ViewCamera {
  return isRec(c) && isVec3T(c.position) && isVec3T(c.target) &&
    (c.projection === 'perspective' || c.projection === 'orthographic')
}
export function isViewSections(s: unknown): s is ViewSection[] {
  return Array.isArray(s) && s.length <= MAX_VIEW_SECTIONS &&
    s.every((x) => isRec(x) && isVec3T(x.point) && isVec3T(x.normal))
}

/**
 * A view read back from device storage: null when its core is unusable;
 * otherwise a copy with an invalid camera or cuts dropped (the rest still applies).
 */
export function sanitizeStoredView(v: unknown): FederationView | null {
  if (!isRec(v) || typeof v.name !== 'string' || typeof v.id !== 'string' || !isRec(v.visible)) return null
  const visible: Record<string, boolean> = {}
  for (const [k, b] of Object.entries(v.visible)) if (typeof b === 'boolean') visible[k] = b
  const opacity: Record<string, number> = {}
  if (isRec(v.opacity)) for (const [k, o] of Object.entries(v.opacity)) if (finite(o)) opacity[k] = o as number
  const out: FederationView = {
    id: v.id, name: v.name, visible, opacity,
    colorByDiscipline: v.colorByDiscipline === true,
    createdAt: finite(v.createdAt) ? (v.createdAt as number) : 0,
  }
  if (isViewCamera(v.camera)) out.camera = v.camera
  if (isViewSections(v.sections)) out.sections = v.sections
  return out
}

/** "Name", or "Name (2)", "Name (3)"… — the first not in `taken`. */
export function freeViewName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name
  for (let n = 2; ; n++) {
    const candidate = `${name} (${n})`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Views from a file joining the local list. Local views are never replaced or
 * pushed out: a clashing name gets a suffix, and only as many as fit under
 * `max` come in (in file order). Returns the new list, what came in (as
 * stored — renamed, fresh ids) and how many did not fit.
 */
export function mergeImportedViews(local: FederationView[], incoming: FederationView[], max: number): {
  views: FederationView[]; imported: FederationView[]; skipped: number
} {
  const room = Math.max(0, max - local.length)
  const names = new Set(local.map((v) => v.name))
  const ids = new Set(local.map((v) => v.id))
  const imported: FederationView[] = []
  for (const v of incoming.slice(0, room)) {
    const name = freeViewName(v.name, names)
    names.add(name)
    let id = v.id
    for (let n = 2; ids.has(id); n++) id = `${v.id}-${n}`
    ids.add(id)
    imported.push({ ...v, id, name })
  }
  return { views: [...imported, ...local], imported, skipped: incoming.length - imported.length }
}

export interface ModelLike { id: string; fileName: string; visible: boolean }

export function captureView(
  name: string,
  models: ModelLike[],
  opacityById: Record<string, number>,
  colorByDiscipline: boolean,
  now = Date.now(),
  look: ViewLook = {},
): FederationView {
  const visible: Record<string, boolean> = {}
  const opacity: Record<string, number> = {}
  for (const m of models) {
    visible[m.fileName] = m.visible
    const o = opacityById[m.id]
    if (o !== undefined && o < 0.999) opacity[m.fileName] = clampOpacity(o)
  }
  const view: FederationView = { id: `v${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim() || 'View', visible, opacity, colorByDiscipline, createdAt: now }
  if (look.camera) view.camera = look.camera
  if (look.sections) view.sections = look.sections
  return view
}

/** What applying a view does to the models open now. Files the view does not know keep their state. */
export function resolveView(view: FederationView, models: ModelLike[]): {
  visible: Record<string, boolean>
  opacity: Record<string, number>
  matched: number
} {
  const visible: Record<string, boolean> = {}
  const opacity: Record<string, number> = {}
  let matched = 0
  for (const m of models) {
    if (m.fileName in view.visible) {
      matched++
      visible[m.id] = view.visible[m.fileName]
      opacity[m.id] = view.opacity[m.fileName] ?? 1
    }
  }
  return { visible, opacity, matched }
}

/** Views worth listing for this set: those that name at least one open file. */
export function viewsFor(views: FederationView[], models: ModelLike[]): FederationView[] {
  const open = new Set(models.map((m) => m.fileName))
  return views.filter((v) => Object.keys(v.visible).some((f) => open.has(f)))
}

/** Visibility after "invert": hidden become visible and vice versa — unless that would hide everything. */
export function invertVisibility(models: ModelLike[]): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  const anyHidden = models.some((m) => !m.visible)
  for (const m of models) out[m.id] = anyHidden ? !m.visible : true
  return out
}
