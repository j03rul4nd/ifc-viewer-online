// ─── Federation manifest v1 ───────────────────────────────────────────────────
// A byte-free, versioned JSON description of a federation: which files, how they
// are shown, views, zones and camera. Never holds model bytes, absolute paths or
// personal data. Pure: build, serialise, parse (typed errors).

import type { ModelTransform } from '../types'
import { ok, err, type Result } from './result'
import { parseContainerName } from './federation-index'

export const MANIFEST_KIND = 'ifcv.federation' as const
export const MANIFEST_VERSION = 1 as const
export const MANIFEST_MAX_BYTES = 1024 * 1024

export type RefId = string

export interface ManifestContainer {
  project?: string; originator?: string; zone?: string; level?: string
  type?: string; role?: string; number?: string; revision?: string
}

export interface FederationModelRef {
  refId: RefId
  fileName: string
  size: number
  sha256?: string
  schema?: string
  container?: ManifestContainer
  discipline?: string
  stackKey?: string
  supersededBy?: RefId
  visible: boolean
  parked: boolean
  opacity: number
  transform?: ModelTransform
  placedByHand?: boolean
}

export interface ManifestView {
  id: string
  name: string
  visible: Record<RefId, boolean>
  opacity: Record<RefId, number>
  /** Optional (files written before views carried a camera have none). */
  camera?: { position: Vec3; target: Vec3; projection: 'perspective' | 'orthographic' }
  sections?: Array<{ point: Vec3; normal: Vec3 }>
  colorByDiscipline?: boolean
}

export type Vec3 = [number, number, number]

/** Bounds parseManifest enforces on views — a file is untrusted input. */
export const MAX_MANIFEST_VIEWS = 50
export const MAX_VIEW_NAME = 120
export const MAX_VIEW_ID = 64
export const MAX_VIEW_SECTIONS = 12
export const MAX_VIEW_ENTRIES = 2000

export interface FederationManifestV1 {
  kind: typeof MANIFEST_KIND
  version: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  app: { build: string }
  models: FederationModelRef[]
  presentation: { colorByDiscipline: boolean; views: ManifestView[]; activeViewId?: string }
  zones?: Array<{ id: string; name: string; refIds: RefId[] }>
  camera?: { position: Vec3; target: Vec3 }
  compare?: { baselineIds: string[] }
}

// ── Build ────────────────────────────────────────────────────────────────────

export interface ManifestModelInput {
  /** Session-local key used by views/zones in the input; mapped to a refId. */
  key: string
  fileName: string
  size: number
  sha256?: string
  schema?: string
  visible: boolean
  parked: boolean
  opacity: number
  transform?: ModelTransform
  discipline?: string
  placedByHand?: boolean
}

export interface ManifestInput {
  id: string
  name: string
  createdAt?: string
  /** ISO timestamp for updatedAt (and createdAt when absent). */
  now?: string
  build?: string
  models: ManifestModelInput[]
  colorByDiscipline: boolean
  /** Views keyed by the input model `key`. */
  views?: ManifestView[]
  activeViewId?: string
  zones?: Array<{ id: string; name: string; keys: string[] }>
  camera?: { position: Vec3; target: Vec3 }
  compare?: { baselineIds: string[] }
}

/** Strip any directory part (POSIX or Windows) — only the basename is kept. */
export function baseName(p: string): string {
  const parts = p.split(/[\\/]/)
  return parts[parts.length - 1] ?? p
}

export function buildManifest(input: ManifestInput): FederationManifestV1 {
  const keyToRef = new Map<string, RefId>()
  input.models.forEach((m, i) => keyToRef.set(m.key, `m${i + 1}`))
  const mapRec = <V>(rec: Record<string, V>): Record<RefId, V> => {
    const out: Record<RefId, V> = {}
    for (const [k, v] of Object.entries(rec)) { const r = keyToRef.get(k); if (r) out[r] = v }
    return out
  }

  const models: FederationModelRef[] = input.models.map((m) => {
    const fileName = baseName(m.fileName)
    const c = parseContainerName(fileName)
    const ref: FederationModelRef = {
      refId: keyToRef.get(m.key)!,
      fileName,
      size: m.size,
      visible: m.visible,
      parked: m.parked,
      opacity: m.opacity,
    }
    if (m.sha256) ref.sha256 = m.sha256.toLowerCase()
    if (m.schema) ref.schema = m.schema
    if (c.iso) {
      const container: ManifestContainer = {}
      const set = (k: keyof ManifestContainer, v: string | null) => { if (v) container[k] = v }
      set('project', c.project); set('originator', c.originator); set('zone', c.zone)
      set('level', c.level); set('type', c.type); set('role', c.role); set('number', c.number)
      set('revision', c.revision)
      ref.container = container
      ref.stackKey = c.stackKey
    }
    if (m.discipline) ref.discipline = m.discipline
    if (m.transform) ref.transform = JSON.parse(JSON.stringify(m.transform)) as ModelTransform
    if (m.placedByHand) ref.placedByHand = true
    return ref
  })

  const now = input.now ?? new Date().toISOString()
  const manifest: FederationManifestV1 = {
    kind: MANIFEST_KIND,
    version: MANIFEST_VERSION,
    id: input.id,
    name: input.name,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
    app: { build: input.build ?? '' },
    models,
    presentation: {
      colorByDiscipline: input.colorByDiscipline,
      views: (input.views ?? []).map((v) => {
        const out: ManifestView = { id: v.id, name: v.name, visible: mapRec(v.visible), opacity: mapRec(v.opacity) }
        if (v.camera) out.camera = { position: [...v.camera.position], target: [...v.camera.target], projection: v.camera.projection }
        if (v.sections) out.sections = v.sections.map((c) => ({ point: [...c.point], normal: [...c.normal] }))
        if (v.colorByDiscipline !== undefined) out.colorByDiscipline = v.colorByDiscipline
        return out
      }),
    },
  }
  if (input.activeViewId) manifest.presentation.activeViewId = input.activeViewId
  if (input.zones) {
    manifest.zones = input.zones.map((z) => ({
      id: z.id, name: z.name,
      refIds: z.keys.map((k) => keyToRef.get(k)).filter((r): r is RefId => !!r),
    }))
  }
  if (input.camera) manifest.camera = { position: [...input.camera.position], target: [...input.camera.target] }
  if (input.compare) manifest.compare = { baselineIds: [...input.compare.baselineIds] }
  return manifest
}

export function serializeManifest(m: FederationManifestV1): string {
  return JSON.stringify(m)
}

// ── Parse ────────────────────────────────────────────────────────────────────

export type ManifestErrorCode =
  | 'too-large' | 'invalid-json' | 'not-object' | 'wrong-kind'
  | 'unsupported-version' | 'invalid-field'

export interface ManifestError { code: ManifestErrorCode; message: string; path?: string }

const fail = (code: ManifestErrorCode, message: string, path?: string): Result<never, ManifestError> =>
  err(path ? { code, message, path } : { code, message })

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isVec3 = (v: unknown): boolean => Array.isArray(v) && v.length === 3 && v.every(isNum)
const isXyz = (v: unknown): boolean => isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z)

class FieldError extends Error {
  readonly path: string
  constructor(path: string) { super(path); this.path = path }
}
function need(cond: boolean, path: string): void { if (!cond) throw new FieldError(path) }
function optStr(o: Record<string, unknown>, k: string, path: string): void {
  if (o[k] !== undefined) need(isStr(o[k]), `${path}.${k}`)
}

function checkModel(m: unknown, p: string): void {
  need(isObj(m), p)
  const o = m as Record<string, unknown>
  need(isStr(o.refId) && o.refId !== '', `${p}.refId`)
  need(isStr(o.fileName) && !/[\\/]/.test(o.fileName), `${p}.fileName`)
  need(isNum(o.size) && o.size >= 0, `${p}.size`)
  need(typeof o.visible === 'boolean', `${p}.visible`)
  need(typeof o.parked === 'boolean', `${p}.parked`)
  need(isNum(o.opacity), `${p}.opacity`)
  for (const k of ['sha256', 'schema', 'discipline', 'stackKey', 'supersededBy']) optStr(o, k, p)
  if (o.placedByHand !== undefined) need(typeof o.placedByHand === 'boolean', `${p}.placedByHand`)
  if (o.container !== undefined) {
    need(isObj(o.container), `${p}.container`)
    for (const v of Object.values(o.container as object)) need(isStr(v), `${p}.container`)
  }
  if (o.transform !== undefined) {
    need(isObj(o.transform), `${p}.transform`)
    const t = o.transform as Record<string, unknown>
    if (t.position !== undefined) need(isXyz(t.position), `${p}.transform.position`)
    if (t.rotation !== undefined) need(isXyz(t.rotation), `${p}.transform.rotation`)
    if (t.scale !== undefined) need(isNum(t.scale) || isXyz(t.scale), `${p}.transform.scale`)
  }
}

function checkV1(o: Record<string, unknown>): void {
  need(isStr(o.id), 'id')
  need(isStr(o.name), 'name')
  need(isStr(o.createdAt), 'createdAt')
  need(isStr(o.updatedAt), 'updatedAt')
  need(isObj(o.app) && isStr(o.app.build), 'app')
  need(Array.isArray(o.models), 'models')
  const models = o.models as unknown[]
  models.forEach((m, i) => checkModel(m, `models[${i}]`))
  const ids = new Set(models.map((m) => (m as FederationModelRef).refId))
  need(ids.size === models.length, 'models.refId')
  need(isObj(o.presentation), 'presentation')
  const pr = o.presentation as Record<string, unknown>
  need(typeof pr.colorByDiscipline === 'boolean', 'presentation.colorByDiscipline')
  need(Array.isArray(pr.views), 'presentation.views')
  need((pr.views as unknown[]).length <= MAX_MANIFEST_VIEWS, 'presentation.views')
  ;(pr.views as unknown[]).forEach((v, i) => {
    const p = `presentation.views[${i}]`
    need(isObj(v), p)
    const vo = v as Record<string, unknown>
    need(isStr(vo.id) && vo.id.length <= MAX_VIEW_ID && isStr(vo.name) && vo.name.length <= MAX_VIEW_NAME, p)
    need(isObj(vo.visible) && Object.keys(vo.visible).length <= MAX_VIEW_ENTRIES &&
      Object.values(vo.visible).every((b) => typeof b === 'boolean'), `${p}.visible`)
    need(isObj(vo.opacity) && Object.keys(vo.opacity).length <= MAX_VIEW_ENTRIES &&
      Object.values(vo.opacity).every(isNum), `${p}.opacity`)
    if (vo.camera !== undefined) {
      const c = vo.camera
      need(isObj(c) && isVec3(c.position) && isVec3(c.target) &&
        (c.projection === 'perspective' || c.projection === 'orthographic'), `${p}.camera`)
    }
    if (vo.sections !== undefined) {
      need(Array.isArray(vo.sections) && vo.sections.length <= MAX_VIEW_SECTIONS &&
        vo.sections.every((s) => isObj(s) && isVec3(s.point) && isVec3(s.normal)), `${p}.sections`)
    }
    if (vo.colorByDiscipline !== undefined) need(typeof vo.colorByDiscipline === 'boolean', `${p}.colorByDiscipline`)
  })
  optStr(pr, 'activeViewId', 'presentation')
  if (o.zones !== undefined) {
    need(Array.isArray(o.zones), 'zones')
    ;(o.zones as unknown[]).forEach((z, i) => {
      need(isObj(z), `zones[${i}]`)
      const zo = z as Record<string, unknown>
      need(isStr(zo.id) && isStr(zo.name) && Array.isArray(zo.refIds) && zo.refIds.every(isStr), `zones[${i}]`)
    })
  }
  if (o.camera !== undefined) {
    need(isObj(o.camera), 'camera')
    const c = o.camera as Record<string, unknown>
    need(isVec3(c.position) && isVec3(c.target), 'camera')
  }
  if (o.compare !== undefined) {
    const c = o.compare
    need(isObj(c) && Array.isArray(c.baselineIds) && c.baselineIds.every(isStr), 'compare')
  }
}

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length

/** Parse a manifest from a JSON string or an already-parsed value. */
export function parseManifest(json: string | unknown): Result<FederationManifestV1, ManifestError> {
  let value: unknown = json
  if (typeof json === 'string') {
    if (utf8Bytes(json) > MANIFEST_MAX_BYTES) return fail('too-large', `Manifest exceeds ${MANIFEST_MAX_BYTES} bytes`)
    try { value = JSON.parse(json) } catch { return fail('invalid-json', 'Not valid JSON') }
  } else {
    let s: string | undefined
    try { s = JSON.stringify(json) } catch { return fail('invalid-json', 'Not serialisable') }
    if (s !== undefined && utf8Bytes(s) > MANIFEST_MAX_BYTES) {
      return fail('too-large', `Manifest exceeds ${MANIFEST_MAX_BYTES} bytes`)
    }
  }
  if (!isObj(value)) return fail('not-object', 'Manifest must be an object')
  if (value.kind !== MANIFEST_KIND) return fail('wrong-kind', 'Not a federation manifest')
  if (typeof value.version !== 'number' || !Number.isInteger(value.version) || value.version < 1) {
    return fail('invalid-field', 'Invalid version', 'version')
  }
  // Migrations vN→vN+1 would chain here; only v1 exists today.
  if (value.version !== MANIFEST_VERSION) {
    return fail('unsupported-version', `Unsupported manifest version ${value.version}`, 'version')
  }
  try { checkV1(value) } catch (e) {
    if (e instanceof FieldError) return fail('invalid-field', `Invalid field ${e.path}`, e.path)
    throw e
  }
  return ok(value as unknown as FederationManifestV1)
}
