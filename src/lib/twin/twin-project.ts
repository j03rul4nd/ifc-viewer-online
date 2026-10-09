// ─── twin-project ─────────────────────────────────────────────────────────────
// The `.twin.json` file: sources + bindings, portable alongside the project's
// IFC files. Bindings point at GlobalIds, so the file keeps working when the
// IFCs are re-exported, split differently, or opened on another machine.
//
// Never carries secrets: request headers (API keys) stay on the device that
// typed them and are stripped here.

import type { Binding, DeviceSource } from './devices'

export interface TwinProject {
  v: 1
  kind: 'ifc-twin'
  sources: DeviceSource[]
  bindings: Binding[]
}

export function exportTwinProject(sources: DeviceSource[], bindings: Binding[]): string {
  const clean = sources.map(({ id, name, url, intervalS, mapping, enabled }) => ({ id, name, url, intervalS, mapping, enabled }))
  const doc: TwinProject = { v: 1, kind: 'ifc-twin', sources: clean, bindings }
  return JSON.stringify(doc, null, 2)
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Parse and sanity-check a `.twin.json`. Returns null when it is not one. */
export function parseTwinProject(text: string): TwinProject | null {
  let doc: unknown
  try { doc = JSON.parse(text) } catch { return null }
  if (!isObj(doc) || doc.kind !== 'ifc-twin' || doc.v !== 1) return null
  if (!Array.isArray(doc.sources) || !Array.isArray(doc.bindings)) return null
  const sources = doc.sources.filter((s): s is DeviceSource =>
    isObj(s) && typeof s.id === 'string' && typeof s.url === 'string' && isObj(s.mapping))
    .map((s) => ({ ...s, name: String(s.name ?? s.url), intervalS: Math.max(1, Number(s.intervalS) || 30), enabled: s.enabled !== false }))
  const ids = new Set(sources.map((s) => s.id))
  const bindings = doc.bindings.filter((b): b is Binding =>
    isObj(b) && typeof b.id === 'string' && typeof b.sourceId === 'string' && ids.has(b.sourceId)
    && typeof b.deviceId === 'string' && Array.isArray(b.targets) && Array.isArray(b.rules))
    .map((b) => ({ ...b, staleColor: b.staleColor ?? null, staleAfterS: Number(b.staleAfterS) || 0 }))
  return { v: 1, kind: 'ifc-twin', sources, bindings }
}
