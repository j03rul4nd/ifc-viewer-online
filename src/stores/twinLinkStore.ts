// ─── Twin link store ──────────────────────────────────────────────────────────
// Connections the USER makes, on top of the ones the twin index infers: "this
// sensor feed belongs to that IFC element", "this substation's maintenance
// sheet is at this URL". The index can only find what the data already
// shares; these are the facts that live in someone's head.
//
// Entities are referenced by STABLE keys (twin-sources.stableKeyOf): a layer's
// name + the feature's own id, an IFC element's GlobalId, a scan's file name —
// never runtime ids, which change on every reload. Device-local.

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface StableRef {
  /** 'vector' | 'ifc' | 'pointcloud' | 'mesh' */
  source: string
  /** Survives reloads: see twin-sources.stableKeyOf. */
  key: string
  /** Shown when the other side is not loaded right now. */
  label: string
}

export interface ManualLink {
  id: string
  from: StableRef
  /** Another entity… */
  to?: StableRef
  /** …or a web resource (datasheet, dashboard, document). */
  url?: string
  title?: string
  createdAt: number
}

const LS_KEY = 'ifc-twin-links:v1'

function load(): ManualLink[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const parsed = raw ? JSON.parse(raw) as { v?: number; links?: ManualLink[] } : null
    return parsed?.v === 1 && Array.isArray(parsed.links) ? parsed.links : []
  } catch { return [] }
}

function save(links: ManualLink[]): void {
  try {
    if (links.length === 0) localStorage.removeItem(LS_KEY)
    else localStorage.setItem(LS_KEY, JSON.stringify({ v: 1, links }))
  } catch { /* quota / private mode */ }
}

interface TwinLinkState {
  links: ManualLink[]
  /** The entity waiting for its partner while the user picks one ("Link to…"). */
  linking: StableRef | null
  startLinking: (from: StableRef | null) => void
  addLink: (from: StableRef, to: StableRef) => void
  addUrl: (from: StableRef, url: string, title?: string) => void
  remove: (id: string) => void
}

const newId = (): string => `tl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

export const useTwinLinkStore = create<TwinLinkState>()(
  devtools(
    (set, get) => ({
      links: load(),
      linking: null,
      startLinking: (from) => set({ linking: from }, false, 'startLinking'),
      addLink: (from, to) => {
        if (from.key === to.key) return
        const exists = get().links.some((l) => l.to &&
          ((l.from.key === from.key && l.to.key === to.key) || (l.from.key === to.key && l.to.key === from.key)))
        if (exists) { set({ linking: null }); return }
        const links = [...get().links, { id: newId(), from, to, createdAt: Date.now() }]
        save(links)
        set({ links, linking: null }, false, 'addLink')
      },
      addUrl: (from, url, title) => {
        const links = [...get().links, { id: newId(), from, url, title: title?.trim() || undefined, createdAt: Date.now() }]
        save(links)
        set({ links }, false, 'addUrl')
      },
      remove: (id) => {
        const links = get().links.filter((l) => l.id !== id)
        save(links)
        set({ links }, false, 'remove')
      },
    }),
    { name: 'TwinLinkStore', enabled: import.meta.env.DEV },
  ),
)

/** Links touching an entity, in either direction. */
export function linksOf(links: ManualLink[], key: string): ManualLink[] {
  return links.filter((l) => l.from.key === key || l.to?.key === key)
}
