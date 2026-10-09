/**
 * Full web-ifc type code → PascalCase IFC class name map (IFC2X3 + IFC4 + IFC4X3).
 *
 * Derived from web-ifc's own schema namespaces instead of a hand-written table,
 * so every entity code resolves (e.g. 1634111441 → 'IfcAirTerminal').
 */
import * as WebIFC from 'web-ifc'

let cache: Map<number, string> | null = null

function build(): Map<number, string> {
  const map = new Map<number, string>()
  const lib = WebIFC as unknown as Record<string, unknown>
  for (const schema of ['IFC2X3', 'IFC4', 'IFC4X3']) {
    const ns = lib[schema]
    if (!ns || typeof ns !== 'object') continue
    for (const name of Object.keys(ns)) {
      if (!name.startsWith('Ifc')) continue
      const code = lib[name.toUpperCase()]
      if (typeof code === 'number' && !map.has(code)) map.set(code, name)
    }
  }
  return map
}

/** PascalCase class name for a web-ifc type code, or undefined if unknown. */
export function ifcClassNameFromCode(code: number): string | undefined {
  cache ??= build()
  return cache.get(code)
}
