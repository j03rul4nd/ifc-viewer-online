// ─── Far-from-origin coordinate detection ─────────────────────────────────────
// Some exporters (Civil 3D is the usual one) write projected coordinates — UTM
// eastings and northings, seven digits — straight into the geometry, with every
// placement at zero and no IfcMapConversion. web-ifc moves that offset into each
// element's float64 transform, and @thatopen/fragments then SKIPS every element
// whose transform is more than `distanceThreshold` (100 km) from the origin. The
// model loads, has properties and a tree, and draws nothing at all.
//
// The converter keeps a model's own coordinates by default (see
// ifc-parser.worker). This scan tells it when that is impossible: one point past
// the threshold is enough to switch to COORDINATE_TO_ORIGIN, whose shift is kept
// in the .frag as the coordination matrix and read back by the viewer as
// `modelCoordination`, so measurements, the map and point-cloud registration
// still reason in the file's real coordinates.
//
// A false positive (one stray far point in a model otherwise near the origin) is
// harmless: web-ifc centres on the first mesh, so the recorded shift is small,
// and every consumer already corrects for whatever shift there is.

/** Same distance @thatopen/fragments uses to drop elements (IfcImporter.distanceThreshold). */
export const FAR_COORDINATE_THRESHOLD = 1e5

const PATTERN = 'IFCCARTESIANPOINT'
const P = Array.from(PATTERN, (c) => c.charCodeAt(0))

const SEMICOLON = 0x3b
const QUOTE = 0x27
const MAX_TOKEN = 32

function isNumberByte(b: number): boolean {
  // 0-9 . + - E e
  return (b >= 0x30 && b <= 0x39) || b === 0x2e || b === 0x2b || b === 0x2d || b === 0x45 || b === 0x65
}

/**
 * True when any IFCCARTESIANPOINT (or IFCCARTESIANPOINTLIST2D/3D) in the STEP
 * text has a coordinate whose magnitude reaches `thresholdM` metres. Byte-level and
 * allocation-free apart from short numeric tokens; stops at the first hit.
 */
export function hasFarCoordinates(bytes: Uint8Array, thresholdM = FAR_COORDINATE_THRESHOLD): boolean {
  // Coordinates are written in the file's length unit: 150 000 is a 150 m
  // building in a millimetre file and 150 km in a metre one.
  const threshold = thresholdM / lengthUnitScale(bytes)
  const n = bytes.length
  const first = P[0]
  const plen = P.length
  let i = 0
  while (i < n) {
    if (bytes[i] !== first) { i++; continue }
    let k = 1
    while (k < plen && i + k < n && bytes[i + k] === P[k]) k++
    if (k < plen) { i++; continue }

    // Inside a point entity: read numbers until the statement ends. Strings are
    // not expected here, but a quote ends the scan of this entity defensively.
    let j = i + plen
    while (j < n && bytes[j] !== SEMICOLON && bytes[j] !== QUOTE) {
      const b = bytes[j]
      // A number starts with a digit, sign or dot — never with E (the entity
      // name suffix LIST3D has no E, but guard anyway).
      if ((b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x2b || b === 0x2e) {
        // Fast path: the integer part, accumulated as the bytes go by. Only a
        // token with an exponent (rare in coordinates) is parsed as a string.
        let end = j
        let intPart = 0
        let inInt = true
        let hasExp = false
        while (end < n && end - j < MAX_TOKEN && isNumberByte(bytes[end])) {
          const c = bytes[end]
          if (c === 0x45 || c === 0x65) hasExp = true
          else if (c === 0x2e) inInt = false
          else if (inInt && c >= 0x30 && c <= 0x39) intPart = intPart * 10 + (c - 0x30)
          end++
        }
        if (hasExp) {
          let s = ''
          for (let t = j; t < end; t++) s += String.fromCharCode(bytes[t])
          const v = Number(s)
          if (Number.isFinite(v) && Math.abs(v) >= threshold) return true
        } else if (intPart >= threshold) {
          return true
        }
        j = end
      } else {
        j++
      }
    }
    i = j
  }
  return false
}

// ── Length unit ───────────────────────────────────────────────────────────────

const SI_PREFIX: Record<string, number> = {
  KILO: 1e3, HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3, MICRO: 1e-6,
}

/** Imperial units as exporters name them in IfcConversionBasedUnit. */
const NAMED_UNIT: Record<string, number> = {
  FOOT: 0.3048, FEET: 0.3048, 'US SURVEY FOOT': 1200 / 3937, INCH: 0.0254, YARD: 0.9144, MILE: 1609.344,
}

const LENGTHUNIT = Array.from('.LENGTHUNIT.', (c) => c.charCodeAt(0))

/**
 * Metres per file length unit, from the first IfcSIUnit or
 * IfcConversionBasedUnit declaring a LENGTHUNIT. 1 when none is found or it
 * cannot be read: metres are the default, and a missed millimetre file only
 * costs a harmless shift (the viewer records it) rather than a lost model.
 */
export function lengthUnitScale(bytes: Uint8Array): number {
  const n = bytes.length
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== LENGTHUNIT[0]) continue
    let k = 1
    while (k < LENGTHUNIT.length && bytes[i + k] === LENGTHUNIT[k]) k++
    if (k < LENGTHUNIT.length) continue
    // The whole statement: back to the previous ';', forward to the next.
    let a = i
    while (a > 0 && bytes[a - 1] !== SEMICOLON && i - a < 256) a--
    let b = i
    while (b < n && bytes[b] !== SEMICOLON && b - i < 256) b++
    let line = ''
    for (let t = a; t < b; t++) line += String.fromCharCode(bytes[t])
    line = line.toUpperCase()
    if (line.includes('IFCSIUNIT')) {
      const m = /\.LENGTHUNIT\.\s*,\s*(?:\.([A-Z]+)\.|\$)\s*,\s*\.METRE\./.exec(line)
      if (!m) continue
      return m[1] ? (SI_PREFIX[m[1]] ?? 1) : 1
    }
    if (line.includes('IFCCONVERSIONBASEDUNIT')) {
      const m = /'([^']+)'/.exec(line)
      const scale = m ? NAMED_UNIT[m[1].trim()] : undefined
      if (scale) return scale
    }
  }
  return 1
}
