// ─── ngsi ─────────────────────────────────────────────────────────────────────
// FIWARE context brokers (Orion, Orion-LD, Scorpio, Stellio) speak NGSI-LD or
// NGSIv2. Both wrap every attribute ({ type, value, … }), which rules could not
// reach. This turns an entity into one flat record, so a broker is one more source.

export type NgsiApi = 'ld' | 'v2'

export interface NgsiConfig {
  api: NgsiApi
  /** Broker root, e.g. https://broker.example.com:1026 */
  broker: string
  /** Entity type to read. NGSI-LD needs one. */
  type: string
  /** NGSILD-Tenant / Fiware-Service. */
  tenant: string
  /** Fiware-ServicePath (NGSIv2 only). */
  servicePath: string
  /** JSON-LD @context URL (NGSI-LD only), for short attribute names. */
  context: string
}

export const NGSI_PAGE = 1000
/** A broker with more entities than this is not something to poll from a browser. */
export const NGSI_MAX_PAGES = 10

export const DEFAULT_NGSI: NgsiConfig = { api: 'ld', broker: '', type: '', tenant: '', servicePath: '', context: '' }

export function ngsiUrl(c: NgsiConfig): string {
  const root = c.broker.trim().replace(/\/+$/, '').replace(/\/(ngsi-ld\/v1|v2)(\/.*)?$/, '')
  if (!root) return ''
  const q = new URLSearchParams({ limit: String(NGSI_PAGE) })
  if (c.type.trim()) q.set('type', c.type.trim())
  return `${root}${c.api === 'ld' ? '/ngsi-ld/v1' : '/v2'}/entities?${q}`
}

export function ngsiHeaders(c: NgsiConfig): Record<string, string> {
  const h: Record<string, string> = {}
  const tenant = c.tenant.trim()
  if (c.api === 'ld') {
    if (tenant) h['NGSILD-Tenant'] = tenant
    if (c.context.trim()) h.Link = `<${c.context.trim()}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`
  } else {
    if (tenant) h['Fiware-Service'] = tenant
    if (c.servicePath.trim()) h['Fiware-ServicePath'] = c.servicePath.trim()
  }
  return h
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** A stored config as far as it can be trusted (a file, a shared scene). */
export function cleanNgsi(v: unknown): NgsiConfig | undefined {
  if (!isObj(v) || typeof v.broker !== 'string') return undefined
  const text = (x: unknown): string => (typeof x === 'string' ? x : '')
  return { api: v.api === 'v2' ? 'v2' : 'ld', broker: v.broker, type: text(v.type), tenant: text(v.tenant), servicePath: text(v.servicePath), context: text(v.context) }
}

const LD_TYPES = new Set(['Property', 'Relationship', 'GeoProperty', 'LanguageProperty', 'ListProperty', 'ListRelationship', 'VocabProperty', 'JsonProperty'])

function isEntity(v: unknown): v is Obj {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.type !== 'string') return false
  if (v.id.startsWith('urn:ngsi-ld:')) return true
  return Object.values(v).some((a) => isObj(a) && typeof a.type === 'string' && ('value' in a || 'object' in a))
}

/** The entities in a broker's answer or a subscription's notification; null when it is neither. */
export function ngsiEntities(body: unknown): Obj[] | null {
  const list = Array.isArray(body) ? body
    : isObj(body) && Array.isArray(body.data) && typeof body.subscriptionId === 'string' ? body.data
    : [body]
  return list.length > 0 && list.every(isEntity) ? list as Obj[] : null
}

const shortName = (k: string): string => k.replace(/^.*[/#]/, '') || k

function plain(a: unknown): { value: unknown; unit?: unknown; at?: unknown } {
  // Several instances of one attribute (datasetId): the first stands for it.
  const attr = Array.isArray(a) && isObj(a[0]) && LD_TYPES.has(String(a[0].type)) ? a[0] : a
  if (!isObj(attr) || typeof attr.type !== 'string') return { value: attr }
  if (LD_TYPES.has(attr.type)) {
    const value = 'object' in attr ? attr.object : 'languageMap' in attr ? attr.languageMap : 'json' in attr ? attr.json : 'vocab' in attr ? attr.vocab : attr.value
    return { value, unit: attr.unitCode, at: attr.observedAt ?? attr.modifiedAt }
  }
  if ('value' in attr) { // NGSIv2
    const meta = isObj(attr.metadata) ? attr.metadata : {}
    const time = isObj(meta.dateModified) ? meta.dateModified : isObj(meta.TimeInstant) ? meta.TimeInstant : null
    const unit = isObj(meta.unitCode) ? meta.unitCode.value : undefined
    return { value: attr.value, unit, at: time?.value }
  }
  return { value: attr }
}

/** One entity as a flat record: `id`, `type`, metrics, `<attr>_unit`, `lat`/`lon`, `observedAt`. */
export function ngsiRecord(e: Obj): Obj {
  const out: Obj = { id: e.id, type: e.type }
  let latest = ''
  let latestMs = -Infinity
  for (const [key, raw] of Object.entries(e)) {
    if (key === 'id' || key === 'type' || key === '@context') continue
    const name = shortName(key)
    const { value, unit, at } = plain(raw)
    out[name] = value
    if (unit !== undefined) out[`${name}_unit`] = unit
    if (isObj(value) && value.type === 'Point' && Array.isArray(value.coordinates)) {
      out.lon = value.coordinates[0]
      out.lat = value.coordinates[1]
      delete out[name]
    }
    if (typeof at === 'string' && Date.parse(at) > latestMs) { latest = at; latestMs = Date.parse(at) }
  }
  // Smart Data Models say when it was measured in an attribute of its own.
  const observed = latest || out.dateObserved || out.dateModified
  if (observed) out.observedAt = observed
  return out
}
