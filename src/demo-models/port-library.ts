// ─── Port de Barcelona IFC library ────────────────────────────────────────────
// CC BY 4.0. The catalogue and our copies come from scripts/port-library/mirror.py.

import type { DemoModel, DemoSet } from './models'

export const PORT_SITE = 'https://serveis.portdebarcelona.cat/cataleg_bim_planol/'

export interface PortObject {
  id: string
  name: string
  category: string
  ficha: string
  lods: Array<{ lod: string; size: number; url: string }>
  /** Present when we host a copy. */
  file?: string
  thumb?: string
  lod?: string
  size?: number
  schema?: DemoModel['schema']
}

const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

export function portCategories(all: PortObject[]): string[] {
  return [...new Set(all.map((o) => o.category))]
}

export function searchPort(all: PortObject[], query: string, category: string | null): PortObject[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  return all.filter((o) => (!category || o.category === category) && words.every((w) => fold(`${o.name} ${o.id}`).includes(w)))
}

/** An object we host, as one more demo for the loading manager; null when we do not. */
export function portDemoSet(o: PortObject): DemoSet | null {
  if (!o.file) return null
  const size = o.size ?? 0
  const model: DemoModel = {
    id: `port-${o.id}`, name: o.name, description: o.name, category: 'Infrastructure', fileName: o.file,
    ifcUrl: `${import.meta.env.BASE_URL}models/port-bcn/${encodeURIComponent(o.file)}`,
    sourceUrl: PORT_SITE, sourceLabel: 'Port de Barcelona (CC BY 4.0)', schema: o.schema ?? 'IFC4',
    approximateSize: `${Math.max(1, Math.round(size / 1e3))} KB`, sizeBytes: size,
  }
  return { id: model.id, name: o.name, models: [model], category: 'Infrastructure', sizeBytes: size, featured: false }
}
