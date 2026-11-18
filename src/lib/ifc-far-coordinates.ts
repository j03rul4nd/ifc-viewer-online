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
 * text has a coordinate whose magnitude reaches `threshold`. Byte-level and
 * allocation-free apart from short numeric tokens; stops at the first hit.
 */
export function hasFarCoordinates(bytes: Uint8Array, threshold = FAR_COORDINATE_THRESHOLD): boolean {
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
