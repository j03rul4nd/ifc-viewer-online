// ─── crs ──────────────────────────────────────────────────────────────────────
// proj4 wrapper for converting IFC grid coordinates (projected CRS) → WGS84.
// Bundles the construction-common EPSG definitions; UTM zones are generated
// formulaically. Unknown codes return err('unknownCrs') so the UI can offer a
// proj4-string paste. NO network lookups (plan §7 T3 — offline determinism).
//
// Accuracy note: legacy-datum defs without NTv2/NADCON grid shifts (27700,
// 3146x, the NAD27 UTM band) carry metre-level error, and each says so in its
// `note`. Acceptable — map mode is context visualization, not survey.

import proj4 from 'proj4'
import { ok, err, type Result } from '../result'
import { resolveStatePlane } from './crs-stateplane'

export interface CrsDef {
  /** Normalized code, e.g. "EPSG:25832". */
  code: string
  /** proj4 definition string. */
  def: string
  /** Rough valid domain in WGS84 degrees [west, south, east, north] for gate 3. */
  domain: [number, number, number, number]
  /** Human note shown in the debug panel (accuracy caveats etc.). */
  note?: string
}

// ── Static definitions (non-UTM) ───────────────────────────────────────────────

const STATIC_DEFS: CrsDef[] = [
  {
    code: 'EPSG:27700',
    def: '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs',
    domain: [-9, 49, 2.5, 61.5],
    note: 'OSGB36 without OSTN15 grid shift — expect ~2-5 m error.',
  },
  {
    code: 'EPSG:2154',
    def: '+proj=lcc +lat_0=46.5 +lon_0=3 +lat_1=49 +lat_2=44 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs',
    domain: [-9.9, 41, 10.4, 51.3],
  },
  {
    code: 'EPSG:2056',
    def: '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 +k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel +towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs',
    domain: [5.9, 45.7, 10.6, 47.9],
  },
  {
    code: 'EPSG:28992',
    def: '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 +units=m +no_defs',
    domain: [3.2, 50.7, 7.3, 53.7],
  },
  {
    code: 'EPSG:31256',
    def: '+proj=tmerc +lat_0=0 +lon_0=16.3333333333333 +k=1 +x_0=0 +y_0=-5000000 +ellps=bessel +towgs84=577.326,90.129,463.919,5.137,1.474,5.297,2.4232 +units=m +no_defs',
    domain: [14.3, 46.4, 17.8, 49.1],
    note: 'MGI Austria GK East — legacy datum, metre-level accuracy.',
  },
  // Legacy German Gauss-Krüger zones 2-5 (DHDN) — still common in older exports.
  ...[2, 3, 4, 5].map((zone): CrsDef => ({
    code: `EPSG:${31464 + zone}`,
    def: `+proj=tmerc +lat_0=0 +lon_0=${zone * 3} +k=1 +x_0=${zone}500000 +y_0=0 +ellps=bessel +towgs84=598.1,73.7,418.2,0.202,0.045,-2.455,6.7 +units=m +no_defs`,
    domain: [zone * 3 - 2, 47, zone * 3 + 2, 55.1],
    note: 'DHDN Gauss-Krüger — legacy datum, metre-level accuracy.',
  })),
]

// ── Formulaic UTM definitions ──────────────────────────────────────────────────

type UtmDatum = 'wgs84' | 'etrs89' | 'nad83' | 'nad27'

/**
 * The datum half of a UTM definition, written out per datum rather than left to
 * proj4's `+datum=` shorthand.
 *
 * That is deliberate for NAD27: `+datum=NAD27` expands to `+nadgrids=@conus,…`,
 * and proj4js bundles no NADCON grids. The optional-grid syntax means it does
 * not fail — it quietly skips the shift and returns Clarke 1866 coordinates as
 * if they were WGS84, roughly 100 m out. An explicit 3-parameter CONUS shift is
 * both honest and an order of magnitude closer.
 *
 * NAD83 and ETRS89 are GRS80-based and within ~2 m of WGS84 over their own
 * continents, which is inside this module's stated tolerance.
 */
const UTM_DATUM: Record<UtmDatum, string> = {
  wgs84:  '+datum=WGS84',
  etrs89: '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0',
  nad83:  '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0',
  nad27:  '+ellps=clrk66 +towgs84=-8,160,176,0,0,0,0',
}

function utmDef(zone: number, opts: { south?: boolean; datum?: UtmDatum }): string {
  const datum = UTM_DATUM[opts.datum ?? 'wgs84']
  return `+proj=utm +zone=${zone} ${opts.south ? '+south ' : ''}${datum} +units=m +no_defs`
}

function utmDomain(zone: number, south: boolean): [number, number, number, number] {
  const west = -180 + (zone - 1) * 6
  // ±1 zone of slack — sites near zone borders are routinely forced into a neighbour zone.
  return [west - 6, south ? -80 : -4, west + 12, south ? 4 : 84]
}

function resolveUtm(codeNum: number): CrsDef | null {
  // ETRS89 / UTM (Europe): EPSG:25828–25838
  if (codeNum >= 25828 && codeNum <= 25838) {
    const zone = codeNum - 25800
    return { code: `EPSG:${codeNum}`, def: utmDef(zone, { datum: 'etrs89' }), domain: utmDomain(zone, false) }
  }
  // NAD83 / UTM (North America): EPSG:26901–26923, zones 1–23.
  // This is what essentially every US public LiDAR delivery is written in —
  // USGS 3DEP, NOAA, state programmes, and the PDAL sample corpus behind the
  // demo scans. Without it a US site got the paste-a-proj4-line prompt, which
  // is a fair answer for something exotic and an embarrassing one for the most
  // common projected CRS on the continent.
  if (codeNum >= 26901 && codeNum <= 26923) {
    const zone = codeNum - 26900
    return {
      code: `EPSG:${codeNum}`,
      def: utmDef(zone, { datum: 'nad83' }),
      domain: utmDomain(zone, false),
      note: 'NAD83 aligned to WGS84 — sub-2 m offset in North America.',
    }
  }
  // NAD27 / UTM (North America): EPSG:26701–26722, zones 1–22. Older deliveries
  // and archive survey data still arrive in it.
  if (codeNum >= 26701 && codeNum <= 26722) {
    const zone = codeNum - 26700
    return {
      code: `EPSG:${codeNum}`,
      def: utmDef(zone, { datum: 'nad27' }),
      domain: utmDomain(zone, false),
      note: 'NAD27 via a 3-parameter CONUS shift, no NADCON grid — expect ~5-10 m error.',
    }
  }
  // WGS84 / UTM north: EPSG:32601–32660
  if (codeNum >= 32601 && codeNum <= 32660) {
    const zone = codeNum - 32600
    return { code: `EPSG:${codeNum}`, def: utmDef(zone, {}), domain: utmDomain(zone, false) }
  }
  // WGS84 / UTM south: EPSG:32701–32760
  if (codeNum >= 32701 && codeNum <= 32760) {
    const zone = codeNum - 32700
    return { code: `EPSG:${codeNum}`, def: utmDef(zone, { south: true }), domain: utmDomain(zone, true) }
  }
  return null
}

// ── Custom (user-pasted) definitions ───────────────────────────────────────────

const customDefs = new Map<string, CrsDef>()

/**
 * Register a user-supplied proj4 string under a code (or a synthetic one).
 * Returns err when proj4 rejects the definition.
 */
export function registerCustomProj4(code: string, def: string): Result<CrsDef> {
  const normalized = normalizeEpsgCode(code) ?? code.trim()
  try {
    // Validate by attempting a conversion — proj4 throws on bad strings.
    const converter = proj4(def, 'EPSG:4326')
    converter.forward([0, 0])
  } catch {
    return err(new Error('invalidProj4'))
  }
  const entry: CrsDef = { code: normalized, def, domain: [-180, -90, 180, 90], note: 'User-supplied definition.' }
  customDefs.set(normalized, entry)
  return ok(entry)
}

/** Test-only / reset hook. */
export function clearCustomProj4(): void {
  customDefs.clear()
}

// ── Code parsing & resolution ──────────────────────────────────────────────────

/**
 * Normalize the many spellings of an EPSG reference found in IfcProjectedCRS.Name:
 * "EPSG:25832", "urn:ogc:def:crs:EPSG::25832", "epsg 25832", bare "25832",
 * or loose prose like "ETRS89 UTM Zone 32N". Returns null when unparseable.
 */
export function normalizeEpsgCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = raw.trim()
  // Explicit EPSG number anywhere in the string
  const m = /EPSG[^0-9]{0,3}(\d{4,6})/i.exec(s) ?? /^(\d{4,6})$/.exec(s)
  if (m) return `EPSG:${m[1]}`
  // Loose prose: "ETRS89 ... UTM ... 32" → EPSG:25832 ; "WGS84 UTM 33S" → 32733
  const utm = /UTM[^0-9]{0,10}(\d{1,2})\s*([NS])?/i.exec(s)
  if (utm) {
    const zone = parseInt(utm[1], 10)
    if (zone >= 1 && zone <= 60) {
      if (/ETRS/i.test(s) && zone >= 28 && zone <= 38) return `EPSG:${25800 + zone}`
      const south = utm[2]?.toUpperCase() === 'S'
      return `EPSG:${(south ? 32700 : 32600) + zone}`
    }
  }
  return null
}

/** Resolve a normalized EPSG code (or custom-registered code) to a definition. */
export function resolveCrs(code: string): Result<CrsDef> {
  const normalized = normalizeEpsgCode(code) ?? code.trim()
  const custom = customDefs.get(normalized)
  if (custom) return ok(custom)
  const staticDef = STATIC_DEFS.find((d) => d.code === normalized)
  if (staticDef) return ok(staticDef)
  const m = /^EPSG:(\d+)$/.exec(normalized)
  if (m) {
    const utm = resolveUtm(parseInt(m[1], 10))
    if (utm) return ok(utm)
  }
  // US State Plane: a table rather than a formula, so it lives in its own module.
  // Checked after UTM because a US site is far likelier to be delivered in UTM,
  // and before failing because "paste a proj4 string" is a bad thing to ask of
  // someone whose file already told us exactly which zone it is in.
  const sp = resolveStatePlane(normalized)
  if (sp) return ok(sp)
  return err(new Error('unknownCrs'))
}

// ── Conversion ─────────────────────────────────────────────────────────────────

export interface GridToWgs84Result {
  lat: number
  lon: number
  /** True when the result falls inside the definition's rough domain. */
  inDomain: boolean
}

/**
 * Convert between two projected CRSs directly (metres → metres).
 * Used by the point cloud aligner when a scan and its IFC were delivered in
 * different grids — going through WGS84 by hand would lose precision the
 * proj4 pipeline keeps.
 */
export function gridToGrid(
  from: CrsDef, to: CrsDef, eastings: number, northings: number,
): Result<{ eastings: number; northings: number }> {
  try {
    const [e, n] = proj4(from.def, to.def).forward([eastings, northings])
    if (!Number.isFinite(e) || !Number.isFinite(n)) return err(new Error('crsConversionFailed'))
    return ok({ eastings: e, northings: n })
  } catch {
    return err(new Error('crsConversionFailed'))
  }
}

/** WGS84 degrees → grid eastings/northings (metres). Inverse of gridToWgs84. */
export function wgs84ToGrid(
  def: CrsDef, lat: number, lon: number,
): Result<{ eastings: number; northings: number }> {
  try {
    const [e, n] = proj4('EPSG:4326', def.def).forward([lon, lat])
    if (!Number.isFinite(e) || !Number.isFinite(n)) return err(new Error('crsConversionFailed'))
    return ok({ eastings: e, northings: n })
  } catch {
    return err(new Error('crsConversionFailed'))
  }
}

/** Convert grid eastings/northings (metres) → WGS84 degrees using a resolved def. */
export function gridToWgs84(def: CrsDef, eastings: number, northings: number): Result<GridToWgs84Result> {
  try {
    const [lon, lat] = proj4(def.def, 'EPSG:4326').forward([eastings, northings])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return err(new Error('crsConversionFailed'))
    const [w, s, e, n] = def.domain
    const inDomain = lon >= w && lon <= e && lat >= s && lat <= n
    return ok({ lat, lon, inDomain })
  } catch {
    return err(new Error('crsConversionFailed'))
  }
}
