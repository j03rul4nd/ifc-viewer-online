// ─── Georeferencing extraction Web Worker ─────────────────────────────────────
// Reads georeferencing entities from raw IFC bytes with web-ifc and classifies
// them via the pure ladder (src/lib/geo/georef-ladder.ts). Mirrors the
// validator.worker bootstrap (single-thread WASM, SetWasmPath, OpenModel).
//
// Message protocol
// ─────────────────
// IN   { type: 'extract', id: string, buffer: ArrayBuffer }
// OUT  { type: 'done',    id: string, extraction: GeorefExtraction }
//      { type: 'error',   id: string, message: string }

import { IfcAPI } from 'web-ifc'
import {
  IFCMAPCONVERSION,
  IFCPROJECTEDCRS,
  IFCGEOMETRICREPRESENTATIONCONTEXT,
  IFCSITE,
  IFCPROPERTYSET,
  IFCSIUNIT,
} from 'web-ifc'
import { runGeorefLadder, type GeorefSource, type MapConversionSource } from '../lib/geo/georef-ladder'
import type { GeorefExtraction } from '../lib/geo/geo-types'
import { createLogger } from '../lib/logger'

const log = createLogger('GeoExtractWorker')

// Force single-threaded WASM — nested workers (pthreads) fail inside a worker context
;((): void => {
  const _orig = IfcAPI.prototype.Init
  IfcAPI.prototype.Init = function (locateFile) {
    return _orig.call(this, locateFile, /* forceSingleThread */ true)
  }
})()

// ── Message types ───────────────────────────────────────────────────────────────

export interface GeoExtractInMessage {
  type: 'extract'
  id: string
  buffer: ArrayBuffer
}

export type GeoExtractOutMessage =
  | { type: 'done'; id: string; extraction: GeorefExtraction }
  | { type: 'error'; id: string; message: string }

function post(msg: GeoExtractOutMessage): void {
  self.postMessage(msg)
}

// ── IfcValue unwrapping helpers ─────────────────────────────────────────────────
// web-ifc GetLine wraps attributes as { type, value } — but real files and
// schema versions are inconsistent, so accept bare numbers/strings too.

function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value
    if (typeof inner === 'number') return Number.isFinite(inner) ? inner : null
    if (typeof inner === 'string') {
      const parsed = parseFloat(inner)
      return Number.isFinite(parsed) ? parsed : null
    }
  }
  return null
}

function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value
    return typeof inner === 'string' ? inner : null
  }
  return null
}

function ref(v: unknown): number | null {
  // Entity references arrive as { type: 5, value: expressID }
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value
    return typeof inner === 'number' ? inner : null
  }
  return null
}

/** Compound plane angle: array of numbers or {value} wrappers. */
function numArray(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null
  const out: number[] = []
  for (const item of v) {
    const n = num(item)
    if (n === null) return null
    out.push(n)
  }
  return out
}

function getLine(api: IfcAPI, modelId: number, expressId: number): Record<string, unknown> | null {
  try {
    return api.GetLine(modelId, expressId) as Record<string, unknown> | null
  } catch (e) {
    log.debug(`GetLine #${expressId} failed:`, e)
    return null
  }
}

// ── SI unit prefix → metres-per-unit ───────────────────────────────────────────

const SI_PREFIX_SCALE: Record<string, number> = {
  MILLI: 0.001, CENTI: 0.01, DECI: 0.1, KILO: 1000,
}

function readUnitScale(api: IfcAPI, modelId: number, unitRef: number | null): number {
  if (unitRef === null) return 1
  const unit = getLine(api, modelId, unitRef)
  if (!unit) return 1
  // IfcSIUnit { UnitType, Prefix, Name } — only LENGTHUNIT metres variants handled.
  const name = str(unit['Name'])
  if (name && name.toUpperCase().includes('METRE')) {
    const prefix = str(unit['Prefix'])
    if (prefix) return SI_PREFIX_SCALE[prefix.toUpperCase()] ?? 1
    return 1
  }
  // IfcConversionBasedUnit (feet etc.) — read ConversionFactor.ValueComponent when present.
  const factor = unit['ConversionFactor']
  if (factor && typeof factor === 'object') {
    const fRef = ref(factor)
    const fLine = fRef !== null ? getLine(api, modelId, fRef) : (factor as Record<string, unknown>)
    const value = fLine ? num(fLine['ValueComponent']) : null
    if (value !== null && value > 0) return value
  }
  return 1
}

// ── Source collection ───────────────────────────────────────────────────────────

function readMapConversion(api: IfcAPI, modelId: number): MapConversionSource | null {
  const ids = api.GetLineIDsWithType(modelId, IFCMAPCONVERSION)
  if (ids.size() === 0) return null

  // Prefer the conversion whose SourceCRS is the 3D "Model" representation context.
  let chosen: Record<string, unknown> | null = null
  for (let i = 0; i < ids.size(); i++) {
    const line = getLine(api, modelId, ids.get(i))
    if (!line) continue
    if (!chosen) chosen = line
    const srcRef = ref(line['SourceCRS'])
    if (srcRef !== null) {
      const src = getLine(api, modelId, srcRef)
      if (src && str(src['ContextType'])?.toLowerCase() === 'model') {
        chosen = line
        break
      }
    }
  }
  if (!chosen) return null

  let crsName: string | null = null
  let mapUnitScale = 1
  const targetRef = ref(chosen['TargetCRS'])
  if (targetRef !== null) {
    const crs = getLine(api, modelId, targetRef)
    if (crs) {
      crsName = str(crs['Name']) ?? str(crs['Description'])
      mapUnitScale = readUnitScale(api, modelId, ref(crs['MapUnit']))
    }
  }

  return {
    eastings: num(chosen['Eastings']),
    northings: num(chosen['Northings']),
    orthogonalHeight: num(chosen['OrthogonalHeight']),
    xAxisAbscissa: num(chosen['XAxisAbscissa']),
    xAxisOrdinate: num(chosen['XAxisOrdinate']),
    scale: num(chosen['Scale']),
    crsName,
    mapUnitScale,
  }
}

function readEpsetConversion(api: IfcAPI, modelId: number): MapConversionSource | null {
  const ids = api.GetLineIDsWithType(modelId, IFCPROPERTYSET)
  let conversionProps: Map<string, unknown> | null = null
  let crsProps: Map<string, unknown> | null = null

  for (let i = 0; i < ids.size(); i++) {
    const pset = getLine(api, modelId, ids.get(i))
    if (!pset) continue
    const name = str(pset['Name'])?.toLowerCase()
    if (name !== 'epset_mapconversion' && name !== 'epset_projectedcrs') continue

    const props = new Map<string, unknown>()
    const hasProps = pset['HasProperties']
    if (Array.isArray(hasProps)) {
      for (const p of hasProps) {
        const pRef = ref(p)
        const prop = pRef !== null ? getLine(api, modelId, pRef) : null
        const propName = prop ? str(prop['Name']) : null
        if (prop && propName) props.set(propName.toLowerCase(), prop['NominalValue'])
      }
    }
    if (name === 'epset_mapconversion') conversionProps = props
    else crsProps = props
  }

  if (!conversionProps) return null
  return {
    eastings: num(conversionProps.get('eastings')),
    northings: num(conversionProps.get('northings')),
    orthogonalHeight: num(conversionProps.get('orthogonalheight')),
    xAxisAbscissa: num(conversionProps.get('xaxisabscissa')),
    xAxisOrdinate: num(conversionProps.get('xaxisordinate')),
    scale: num(conversionProps.get('scale')),
    crsName: crsProps ? str(crsProps.get('name')) : null,
    mapUnitScale: 1, // ePSet convention carries values in project units (metres in practice)
  }
}

function readSite(api: IfcAPI, modelId: number): GeorefSource['site'] {
  const ids = api.GetLineIDsWithType(modelId, IFCSITE)
  // Prefer the first site that actually carries coordinates.
  let fallback: GeorefSource['site'] = null
  for (let i = 0; i < ids.size(); i++) {
    const site = getLine(api, modelId, ids.get(i))
    if (!site) continue
    const entry = {
      refLatitude: numArray(site['RefLatitude']),
      refLongitude: numArray(site['RefLongitude']),
      refElevation: num(site['RefElevation']),
    }
    if (entry.refLatitude && entry.refLongitude) return entry
    fallback ??= entry
  }
  return fallback
}

function readTrueNorth(api: IfcAPI, modelId: number): GeorefSource['trueNorth'] {
  const ids = api.GetLineIDsWithType(modelId, IFCGEOMETRICREPRESENTATIONCONTEXT)
  for (let i = 0; i < ids.size(); i++) {
    const ctx = getLine(api, modelId, ids.get(i))
    if (!ctx) continue
    // Prefer the 3D Model context; sub-contexts inherit from it.
    const type = str(ctx['ContextType'])?.toLowerCase()
    if (type && type !== 'model') continue
    const tnRef = ref(ctx['TrueNorth'])
    if (tnRef === null) continue
    const dir = getLine(api, modelId, tnRef)
    const ratios = dir ? numArray(dir['DirectionRatios']) : null
    if (ratios && ratios.length >= 2) return { x: ratios[0], y: ratios[1] }
  }
  return null
}

// ── Handler ─────────────────────────────────────────────────────────────────────

async function handleExtract(id: string, buffer: ArrayBuffer): Promise<void> {
  let api: IfcAPI | null = null
  let modelId = -1
  try {
    api = new IfcAPI()
    // In dev mode Vite serves node_modules directly; in prod WASM is at dist root.
    api.SetWasmPath(
      import.meta.env.DEV
        ? `${import.meta.env.BASE_URL}node_modules/web-ifc/`
        : import.meta.env.BASE_URL,
    )
    await api.Init()
    modelId = api.OpenModel(new Uint8Array(buffer))

    const source: GeorefSource = {
      mapConversion: readMapConversion(api, modelId),
      epsetConversion: readEpsetConversion(api, modelId),
      site: readSite(api, modelId),
      trueNorth: readTrueNorth(api, modelId),
    }
    post({ type: 'done', id, extraction: runGeorefLadder(source) })
  } catch (e) {
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) })
  } finally {
    if (api && modelId !== -1) {
      try { api.CloseModel(modelId) } catch (e) { log.debug('CloseModel failed:', e) }
    }
  }
}

self.onmessage = (e: MessageEvent<GeoExtractInMessage>) => {
  const msg = e.data
  if (msg?.type === 'extract' && typeof msg.id === 'string' && msg.buffer instanceof ArrayBuffer) {
    void handleExtract(msg.id, msg.buffer)
  }
}
