// ─── Reading a payload ────────────────────────────────────────────────────────
// After "Test connection" the wizard has one real sample. From it we find the
// list of records, propose which field is the id, the position (or the IFC
// element it belongs to), the time and the values — and the user only fixes
// what we guessed wrong, looking at a preview of the first rows. Pure.

export interface FieldMapping {
  /** Dotted path to the array of records; '' = the payload is the array. */
  recordsPath: string
  id?: string
  /** Where the record is: coordinates, or an IFC element by GlobalId / tag. */
  place:
    | { kind: 'latlon'; lat: string; lon: string; height?: string }
    | { kind: 'geojson' }
    | { kind: 'ifc'; field: string; matchBy: 'GlobalId' | 'Tag' | 'Name' }
    | { kind: 'none' }
  time?: string
  /** Numeric/text fields shown on the scene and kept in history. */
  values: string[]
}

export function getPath(obj: unknown, path: string): unknown {
  if (!path) return obj
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj)
}

/** Every dotted path to an array of objects, largest first — the candidates for "records". */
export function findRecordArrays(payload: unknown, prefix = '', depth = 0): { path: string; count: number }[] {
  const out: { path: string; count: number }[] = []
  if (Array.isArray(payload)) {
    if (payload.length && typeof payload[0] === 'object' && payload[0] !== null) out.push({ path: prefix, count: payload.length })
    return out
  }
  if (payload && typeof payload === 'object' && depth < 4) {
    for (const [k, v] of Object.entries(payload)) out.push(...findRecordArrays(v, prefix ? `${prefix}.${k}` : k, depth + 1))
  }
  return out.sort((a, b) => b.count - a.count)
}

export function extractRecords(payload: unknown, path: string): Record<string, unknown>[] {
  const v = getPath(payload, path)
  if (Array.isArray(v)) return v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
  // GeoJSON FeatureCollection: flatten properties, keep geometry.
  if (v && typeof v === 'object' && (v as { type?: string }).type === 'FeatureCollection') {
    return ((v as { features?: { properties?: object; geometry?: unknown; id?: unknown }[] }).features ?? [])
      .map((f) => ({ ...(f.properties ?? {}), ...(f.id !== undefined ? { id: f.id } : {}), geometry: f.geometry }))
  }
  return []
}

/** Flat field list of the first records (one level of nesting, dotted). */
export function fieldsOf(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  for (const r of records.slice(0, 20)) {
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'geometry') for (const k2 of Object.keys(v)) seen.add(`${k}.${k2}`)
      else seen.add(k)
    }
  }
  return [...seen]
}

const pick = (fields: string[], patterns: RegExp[]) => {
  for (const re of patterns) { const f = fields.find((x) => re.test(x.split('.').pop()!)); if (f) return f }
  return undefined
}

const IFC_GUID = /^[0-9A-Za-z_$]{22}$/

export function guessMapping(payload: unknown): FieldMapping {
  const recordsPath = getPath(payload, '') && (payload as { type?: string })?.type === 'FeatureCollection' ? '' : findRecordArrays(payload)[0]?.path ?? ''
  const records = extractRecords(payload, recordsPath)
  const fields = fieldsOf(records)
  const lat = pick(fields, [/^lat(itude)?$/i, /^y$/i])
  const lon = pick(fields, [/^(lon|lng|long|longitude)$/i, /^x$/i])
  const guidField = fields.find((f) => records.slice(0, 5).every((r) => IFC_GUID.test(String(getPath(r, f) ?? ''))))
  const place: FieldMapping['place'] = fields.includes('geometry') ? { kind: 'geojson' }
    : lat && lon ? { kind: 'latlon', lat, lon, height: pick(fields, [/^(alt|altitude|height|z|elevation)$/i]) }
      : guidField ? { kind: 'ifc', field: guidField, matchBy: 'GlobalId' }
        : { kind: 'none' }
  const id = pick(fields, [/^id$/i, /_id$/i, /^(device|sensor|station|asset)(_?id)?$/i, /^(tag|code|name)$/i])
  const time = pick(fields, [/^(timestamp|time|ts|datetime|updated_at|last_updated|observed_at|date)$/i])
  const used = new Set([id, time, lat, lon, guidField, 'geometry'].filter(Boolean))
  const values = fields.filter((f) => !used.has(f) && records.some((r) => typeof getPath(r, f) === 'number')).slice(0, 6)
  return { recordsPath, id, place, time, values }
}
