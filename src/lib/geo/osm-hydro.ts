// ─── osm-hydro ────────────────────────────────────────────────────────────────
// What the water needs to know about a neighbourhood, from the same Overpass
// answer the map draws: where its watercourses run (and how big they are),
// where one RAN before it was culverted, filled in or diverted, and which lines
// on the ground stop water — walls, city walls, dykes, embankments.
//
// Kept apart from osm-features on purpose. The map turns a watercourse into a
// bank-to-bank polygon to draw it, and drops whatever is underground or gone;
// a flood needs the opposite — the centreline, its class and width, the
// culverts that carry it under a street, and the old courses that still shape
// the ground. Reading them here leaves the map's drawing exactly as it was.
//
// LIFECYCLE TAGS. OSM keeps a vanished river as a way tagged with a lifecycle
// prefix — `disused:waterway=river`, `abandoned:`, `historic:`, `was:`,
// `razed:`, `removed:` — or as `waterway=*` with `disused=yes` / `abandoned=yes`.
// Mapping is uneven: where none of these exist, the old course is still often
// visible in the terrain (a bare-earth DEM keeps the valley), and the flood
// finds it there on its own.
//
// Pure.

import type { LatLonPoint, OsmFeature } from './osm-features'

export type ChannelClass = 'river' | 'canal' | 'stream' | 'ditch' | 'drain'
export type WaterBarrierClass = 'wall' | 'city_wall' | 'retaining_wall' | 'flood_wall' | 'dyke' | 'embankment'

export interface HydroChannel {
  id: string
  cls: ChannelClass
  line: LatLonPoint[]
  /** Surface width, metres (tagged, else a per-class default). */
  widthM: number
  /** Depth below the banks, metres (tagged, else a per-class default). */
  depthM: number
  /** Carried under a street or a building (`tunnel=culvert` / `culvert`). */
  culvert: boolean
  /** A course that is no longer there (lifecycle-prefixed or disused). */
  historic: boolean
  name?: string
}

export interface HydroBarrier {
  id: string
  cls: WaterBarrierClass
  line: LatLonPoint[]
  /** Height above the ground, metres (tagged, else a per-class default). */
  heightM: number
  name?: string
}

export interface Hydrology {
  channels: HydroChannel[]
  barriers: HydroBarrier[]
}

/** A neighbourhood's OSM data as an analysis reads it (geo-system getOsmContext). */
export interface OsmContext {
  features: OsmFeature[]
  hydro: Hydrology
  /** The Overpass answer hit its element cap: the picture is partial. */
  truncated: boolean
  /** Built from the basemap's vector tiles (Overpass was down): coarser tags, no hydrology. */
  fallback: boolean
  /** Scene (x, z) of a WGS84 point, through the map's placement. */
  toScene(lat: number, lon: number): { x: number; z: number }
}

const CHANNEL_CLASSES = new Set<ChannelClass>(['river', 'canal', 'stream', 'ditch', 'drain'])
const LIFECYCLE = ['disused', 'abandoned', 'historic', 'was', 'razed', 'removed', 'demolished']

const DEFAULT_WIDTH: Record<ChannelClass, number> = { river: 22, canal: 12, stream: 3, ditch: 1.6, drain: 1.6 }
const DEFAULT_DEPTH: Record<ChannelClass, number> = { river: 2, canal: 1.5, stream: 0.6, ditch: 0.5, drain: 0.5 }
const DEFAULT_HEIGHT: Record<WaterBarrierClass, number> = {
  wall: 1.5, city_wall: 4, retaining_wall: 1, flood_wall: 1.5, dyke: 2, embankment: 1.5,
}

/** A length tag in metres ("3", "3 m", "2.5m"); null when unreadable. */
function metres(v: string | undefined): number | null {
  if (!v) return null
  const m = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(m|meters?|metres?)?\s*$/i.exec(v)
  return m ? Number(m[1]) : null
}

/** The channel class and whether the course is gone, from a way's tags. */
export function channelOf(tags: Record<string, string>): { cls: ChannelClass; historic: boolean } | null {
  const live = tags['waterway'] as ChannelClass | undefined
  const gone = tags['disused'] === 'yes' || tags['abandoned'] === 'yes'
  if (live && CHANNEL_CLASSES.has(live)) return { cls: live, historic: gone }
  for (const p of LIFECYCLE) {
    const v = tags[`${p}:waterway`] as ChannelClass | undefined
    if (v && CHANNEL_CLASSES.has(v)) return { cls: v, historic: true }
  }
  return null
}

/** The barrier class of a way that stops water, or null (fences and hedges do not). */
export function waterBarrierOf(tags: Record<string, string>): WaterBarrierClass | null {
  const b = tags['barrier']
  if (b === 'wall' || b === 'city_wall' || b === 'retaining_wall') return b
  if (b === 'flood_wall' || tags['flood_prone'] === 'flood_wall') return 'flood_wall'
  const mm = tags['man_made']
  if (mm === 'dyke' || mm === 'flood_wall') return mm === 'dyke' ? 'dyke' : 'flood_wall'
  if (mm === 'embankment' || tags['embankment'] === 'yes' || tags['embankment'] === 'dyke') return tags['embankment'] === 'dyke' ? 'dyke' : 'embankment'
  return null
}

interface RawElement {
  type?: string
  id?: number
  tags?: Record<string, string>
  geometry?: Array<{ lat: number; lon: number } | null>
}

/** Channels and water barriers from an Overpass `out geom` answer. */
export function extractHydrology(json: unknown): Hydrology {
  const elements = (json as { elements?: RawElement[] } | null)?.elements
  const channels: HydroChannel[] = []
  const barriers: HydroBarrier[] = []
  const seen = new Set<number>()
  if (!Array.isArray(elements)) return { channels, barriers }
  for (const el of elements) {
    if (el?.type !== 'way' || !el.tags || !Array.isArray(el.geometry) || el.id === undefined) continue
    if (seen.has(el.id)) continue // groups of one query can return a way twice
    const line = el.geometry.filter((p): p is LatLonPoint => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    if (line.length < 2) continue
    const t = el.tags
    const ch = channelOf(t)
    if (ch) {
      seen.add(el.id)
      channels.push({
        id: `w${el.id}`, cls: ch.cls, line,
        widthM: Math.min(400, metres(t['width']) ?? DEFAULT_WIDTH[ch.cls]),
        depthM: Math.min(20, metres(t['depth']) ?? DEFAULT_DEPTH[ch.cls]),
        culvert: t['tunnel'] === 'culvert' || t['culvert'] === 'yes' || (t['tunnel'] === 'yes' && !ch.historic),
        historic: ch.historic,
        name: t['name'] ?? t['old_name'] ?? t['historic:name'],
      })
      continue
    }
    const b = waterBarrierOf(t)
    if (b) {
      seen.add(el.id)
      barriers.push({ id: `w${el.id}`, cls: b, line, heightM: Math.min(20, metres(t['height']) ?? DEFAULT_HEIGHT[b]), name: t['name'] })
    }
  }
  return { channels, barriers }
}

/** The Overpass selectors for what osm-features does not already ask for. */
export function hydrologyQueryParts(b: string): string {
  return LIFECYCLE.map((p) => `way["${p}:waterway"](${b});`).join('')
    + `way["waterway"]["disused"="yes"](${b});way["waterway"]["abandoned"="yes"](${b});`
    + `way["man_made"~"^(dyke|embankment|flood_wall)$"](${b});way["embankment"~"^(yes|dyke)$"](${b});`
    + `way["barrier"="flood_wall"](${b});`
}
