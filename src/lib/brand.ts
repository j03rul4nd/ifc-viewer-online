// ─── Branded / Nominal Types ──────────────────────────────────────────────────
// Structural typing lets TypeScript treat `type ExpressId = number` and
// `type ModelId = number` as interchangeable — they're both just numbers.
// Branded types attach an invisible marker so the compiler distinguishes them.
//
// Usage:
//   function focusElement(id: ExpressId) { ... }
//   focusElement(42)                // ✗ Argument of type 'number' is not assignable
//   focusElement(asExpressId(42))   // ✓
//
// The brand is erased at runtime — zero overhead.

declare const __brand: unique symbol
export type Brand<T, B extends string> = T & { readonly [__brand]: B }

// ── Domain ID types ────────────────────────────────────────────────────────────

/** Numeric IFC element identifier (auto-incremented per model). */
export type ExpressId = Brand<number, 'ExpressId'>

/** 22-character IFC GlobalId (base64-like, unique per project). */
export type GlobalId  = Brand<string, 'GlobalId'>

/** OPFS cache key: `${fileName}:${size}:${lastModified}`. */
export type CacheKey  = Brand<string, 'CacheKey'>

/** web-ifc internal model handle returned by IfcAPI.OpenModel(). */
export type IfcModelId = Brand<number, 'IfcModelId'>

// ── Safe constructors ──────────────────────────────────────────────────────────
// These perform optional dev-mode validation and cast to the branded type.
// Call them at the boundary where raw values enter the domain layer.

export function asExpressId(n: number): ExpressId {
  if (import.meta.env.DEV && (!Number.isInteger(n) || n < 0)) {
    console.warn(`[Brand] Suspicious ExpressId value: ${n}`)
  }
  return n as ExpressId
}

export function asGlobalId(s: string): GlobalId {
  if (import.meta.env.DEV && !/^[0-9A-Za-z_$]{1,22}$/.test(s)) {
    console.warn(`[Brand] Suspicious GlobalId format: "${s}"`)
  }
  return s as GlobalId
}

export function asCacheKey(s: string): CacheKey {
  return s as CacheKey
}

export function asIfcModelId(n: number): IfcModelId {
  if (import.meta.env.DEV && n === -1) {
    console.warn('[Brand] IfcModelId is -1 — model may not be open')
  }
  return n as IfcModelId
}

// ── Stripping (for interop with plain APIs) ────────────────────────────────────

export const toNumber = (id: Brand<number, string>): number => id as unknown as number
export const toString = (id: Brand<string, string>): string => id as unknown as string
