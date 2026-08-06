// ─── ifc-value ────────────────────────────────────────────────────────────────
// Unwrapping web-ifc attribute values. PURE — imported by the geo-extract
// worker AND by vitest (same split as georef-ladder / terrain-sampling).
//
// Why this deserves its own tested module: web-ifc returns IFC attributes in
// several shapes depending on the underlying EXPRESS type — a bare primitive,
// a `{ type, value }` wrapper, or a wrapper whose `value` is itself a list.
// Guessing wrong does not throw; it silently yields null, and a null here
// downgrades a perfectly georeferenced model to "no georeferencing". That is
// exactly the bug these helpers were extracted to fix and keep fixed.

/** Numeric attribute: `12`, `{ value: 12 }`, or `{ value: '12' }`. */
export function num(v: unknown): number | null {
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

/** String attribute: `'x'` or `{ value: 'x' }`. */
export function str(v: unknown): string | null {
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value
    return typeof inner === 'string' ? inner : null
  }
  return null
}

/** Entity reference: `{ type: 5, value: expressID }` → the express id. */
export function ref(v: unknown): number | null {
  if (v && typeof v === 'object' && 'value' in v) {
    const inner = (v as { value: unknown }).value
    return typeof inner === 'number' ? inner : null
  }
  return null
}

/**
 * Numeric LIST attribute.
 *
 * The subtle case, and the reason this file exists: an
 * `IfcCompoundPlaneAngleMeasure` (IfcSite RefLatitude / RefLongitude) comes
 * back from web-ifc as the wrapper `{ type: 10, value: number[] }`, NOT as a
 * bare array. Testing `Array.isArray` at the top level rejected every one of
 * them, which disabled rung 3 of the georeferencing ladder outright — the most
 * common way IFC2x3 files carry a location. Unwrap first, then validate each
 * element (which may itself be wrapped).
 */
export function numArray(v: unknown): number[] | null {
  const raw: unknown[] | null = Array.isArray(v)
    ? v
    : v && typeof v === 'object' && Array.isArray((v as { value?: unknown }).value)
      ? (v as { value: unknown[] }).value
      : null
  if (!raw || raw.length === 0) return null
  const out: number[] = []
  for (const item of raw) {
    const n = num(item)
    if (n === null) return null
    out.push(n)
  }
  return out
}
