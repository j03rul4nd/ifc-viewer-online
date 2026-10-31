// ─── Tracking globe: routes ──────────────────────────────────────────────────
// Schematic lanes for a map, not navigation. Ships follow a small graph of open
// water and straits (a test walks every lane over the land data); air takes the
// great circle; rail takes the China-Europe corridor or the straight line.
import { DEST_AIRPORTS, DEST_PORTS, DEST_RAIL, ORIGIN_AIRPORTS, ORIGIN_PORTS, ORIGIN_RAIL, type LatLng } from '../components/msp/supply/geo'
import type { Mode, Place } from './config'

export const SEA: Record<string, LatLng> = {
  yellow: [34, 123.5], ecs: [29.5, 124], taiwan: [24.6, 119.7], luzon: [20.6, 121.3], scs: [17, 114], vietnam: [9.5, 109.8], singapore: [1.15, 104.1], malacca: [4.6, 98.9],
  ceylon: [5.3, 81], arabian: [13.5, 56], gulfAden: [12.2, 45.5], redS: [17.5, 40.2], redN: [26, 35.2], suez: [29.7, 32.57], said: [31.6, 32.3], medE: [34.3, 26], sicily: [36.5, 13],
  alboran: [36.3, -2], gibraltar: [35.95, -6], finisterre: [44, -10.5], ushant: [48.9, -6.5], channel: [50.2, -0.5], dover: [51.1, 1.65], northSea: [54.3, 5],
  sunda: [-6.3, 105], indianS: [-25, 70], agulhas: [-36.5, 20], atlSE: [-15, -3], cverde: [15, -20], canaries: [28, -17],
  japan: [31.5, 136], npac: [42, -178], california: [33, -121], panamaP: [7.3, -79.7], panamaA: [10, -80], caribbean: [18.7, -74.5], usEast: [37, -72], natl: [46, -35], brazilNE: [-7, -33], santosOff: [-25.5, -44.5],
  perth: [-33, 112], bight: [-38, 133], tasman: [-36, 152], gulfOman: [24.8, 58.5], hormuz: [26.4, 56.6], gulf: [25.6, 54.2], mozambique: [-20, 40], capeTown: [-35, 16],
  mal1: [1.1, 103.4], mal2: [3, 100.7], aceh: [6.6, 94.8], karimata: [-2, 106.9], javaSea: [-5.4, 106.2], omanOff: [22.5, 61], bab: [12.6, 43.3], bizerte: [37.7, 9.5], algerOff: [37.5, 2], balearic: [38.6, 1.5], stVincent: [36.5, -9.8],
  natalOff: [-31.5, 33], bajaOff: [20, -112], cocos: [10, -92], carS: [13.5, -72], guyana: [9, -56], amazon: [2, -45], abrolhos: [-20, -37], leeuwin: [-36, 114.5], bassW: [-39.5, 143], bassM: [-39.7, 146.5], bassE: [-38.5, 150],
  qldOff: [-24, 156], solomon: [-12, 155.5], micronesia: [1, 152], philSea: [14, 130], liberia: [2, -13], guinea: [3, 0],
}
export const EDGES = 'yellow-ecs ecs-taiwan ecs-luzon ecs-japan taiwan-scs luzon-scs scs-vietnam vietnam-singapore singapore-mal1 mal1-mal2 mal2-malacca malacca-aceh aceh-ceylon singapore-karimata karimata-javaSea javaSea-sunda ceylon-arabian ceylon-indianS arabian-gulfAden arabian-omanOff omanOff-gulfOman gulfOman-hormuz hormuz-gulf gulfAden-bab bab-redS redS-redN redN-suez suez-said said-medE medE-sicily sicily-bizerte bizerte-algerOff algerOff-alboran algerOff-balearic balearic-alboran alboran-gibraltar gibraltar-stVincent stVincent-finisterre finisterre-ushant ushant-channel channel-dover dover-northSea gibraltar-canaries canaries-cverde cverde-liberia liberia-guinea guinea-atlSE atlSE-capeTown capeTown-agulhas agulhas-indianS sunda-indianS sunda-perth agulhas-natalOff natalOff-mozambique mozambique-arabian japan-npac npac-california california-bajaOff bajaOff-cocos cocos-panamaP panamaP-panamaA panamaA-caribbean caribbean-usEast usEast-natl natl-finisterre natl-ushant panamaA-carS carS-guyana guyana-amazon amazon-brazilNE guyana-cverde cverde-brazilNE brazilNE-abrolhos abrolhos-santosOff santosOff-atlSE perth-leeuwin leeuwin-bight bight-bassW bassW-bassM bassM-bassE bassE-tasman tasman-qldOff qldOff-solomon solomon-micronesia micronesia-philSea philSea-luzon indianS-perth'
  .split(' ').map(e => e.split('-'))

export interface Hub { name: string; at: LatLng; sea?: string }

const short = (n: string) => n.replace(/^Port of /, '').replace(/ rail terminal$/, '').replace(/ airport( \(.*\))?$/, '')
const HUBS: Record<string, Hub> = {}
for (const [k, g] of Object.entries({ yantian: 'scs', shanghai: 'ecs', ningbo: 'ecs', qingdao: 'yellow', xiamen: 'taiwan' })) HUBS[k] = { name: short(ORIGIN_PORTS[k].name), at: ORIGIN_PORTS[k].at, sea: g }
for (const [k, g] of Object.entries({ valencia: 'balearic', barcelona: 'balearic', algeciras: 'gibraltar', genoa: 'sicily', piraeus: 'medE', rotterdam: 'northSea', antwerp: 'dover', hamburg: 'northSea', felixstowe: 'dover' })) HUBS[k] = { name: short(DEST_PORTS[k].name), at: DEST_PORTS[k].at, sea: g }
for (const t of [...Object.values(ORIGIN_AIRPORTS), ...Object.values(DEST_AIRPORTS)]) HUBS[t.id] = { name: t.name.match(/\(([A-Z]{3})\)/)?.[1] ?? short(t.name), at: t.at }
for (const t of [...Object.values(ORIGIN_RAIL), ...Object.values(DEST_RAIL)]) if (!HUBS[t.id.toLowerCase()]) HUBS[t.id.toLowerCase()] = { name: short(t.name), at: t.at }
const more: [string, string, LatLng, string?][] = [
  ['singapore', 'Singapore', [1.26, 103.84], 'singapore'], ['busan', 'Busan', [35.1, 129.05], 'ecs'], ['tokyo', 'Tokyo', [35.55, 139.85], 'japan'], ['hongkong', 'Hong Kong', [22.3, 114.15], 'scs'],
  ['mumbai', 'Mumbai', [18.95, 72.82], 'arabian'], ['dubai', 'Jebel Ali', [25.02, 55.05], 'gulf'], ['durban', 'Durban', [-29.87, 31.05], 'mozambique'], ['capetown', 'Cape Town', [-33.9, 18.42], 'capeTown'],
  ['losangeles', 'Los Angeles', [33.73, -118.26], 'california'], ['newyork', 'New York', [40.65, -74.05], 'usEast'], ['santos', 'Santos', [-23.97, -46.3], 'santosOff'], ['sydney', 'Sydney', [-33.85, 151.25], 'tasman'],
  ['melbourne', 'Melbourne', [-37.85, 144.9], 'bassW'], ['lagos', 'Lagos', [6.42, 3.4], 'guinea'], ['lisbon', 'Lisbon', [38.7, -9.15], 'finisterre'], ['lehavre', 'Le Havre', [49.48, 0.11], 'channel'],
]
for (const [id, name, at, sea] of more) HUBS[id] = { name, at, sea }
const RAIL: LatLng[] = [[36.06, 103.8], [43.8, 87.6], [45.2, 82.5], [50.4, 72], [52.3, 55], [55.75, 37.6], [53.9, 27.6], [52.2, 21]]

export const HUB_IDS = Object.keys(HUBS)
export const SEA_HUB_IDS = HUB_IDS.filter(k => HUBS[k].sea)

export function resolvePlace(p: Place): Hub | null {
  if (typeof p === 'string') {
    const k = p.toLowerCase().replace(/[^a-z0-9]/g, '')
    return HUBS[k] ?? Object.values(HUBS).find(h => h.name.toLowerCase().replace(/[^a-z0-9]/g, '') === k) ?? null
  }
  return { name: p.name ?? `${p.lat.toFixed(2)}, ${p.lng.toFixed(2)}`, at: [p.lat, p.lng] }
}

const R = Math.PI / 180
const vec = ([la, lo]: LatLng) => [Math.cos(la * R) * Math.cos(lo * R), Math.cos(la * R) * Math.sin(lo * R), Math.sin(la * R)]
export function angle(a: LatLng, b: LatLng): number {
  const u = vec(a), v = vec(b)
  return Math.atan2(Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]), u[0] * v[0] + u[1] * v[1] + u[2] * v[2])
}
/** Points along the great circle, at most `step` degrees apart. */
export function densify(pts: LatLng[], step = 3): LatLng[] {
  const out: LatLng[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], w = angle(a, b), n = Math.max(1, Math.ceil(w / R / step))
    const u = vec(a), v = vec(b)
    for (let j = 0; j < n; j++) {
      const t = j / n, s = Math.sin(w) || 1, f = Math.sin((1 - t) * w) / s, g = Math.sin(t * w) / s
      const p = w < 1e-6 ? u : [f * u[0] + g * v[0], f * u[1] + g * v[1], f * u[2] + g * v[2]]
      out.push([Math.atan2(p[2], Math.hypot(p[0], p[1])) / R, Math.atan2(p[1], p[0]) / R])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

/** The waypoints of a sea lane between two gateways. Exported for the land test. */
export function seaPath(a: string, b: string): LatLng[] {
  const dist: Record<string, number> = { [a]: 0 }, prev: Record<string, string> = {}, open = new Set(Object.keys(SEA))
  while (open.size) {
    let u = '', best = Infinity
    for (const k of open) if ((dist[k] ?? Infinity) < best) { best = dist[k]; u = k }
    if (!u || u === b) break
    open.delete(u)
    for (const e of EDGES) {
      const v = e[0] === u ? e[1] : e[1] === u ? e[0] : null
      if (!v || !open.has(v)) continue
      const d = best + angle(SEA[u], SEA[v])
      if (d < (dist[v] ?? Infinity)) { dist[v] = d; prev[v] = u }
    }
  }
  const out: LatLng[] = []
  for (let k: string | undefined = b; k; k = prev[k]) out.unshift(SEA[k])
  return out
}
function gateway(h: Hub): string {
  if (h.sea) return h.sea
  return Object.keys(SEA).reduce((m, k) => angle(SEA[k], h.at) < angle(SEA[m], h.at) ? k : m)
}

/** The line a shipment follows, as lat/lng. */
export function routeFor(from: Hub, to: Hub, mode: Mode): LatLng[] {
  if (mode === 'sea') return densify([from.at, ...seaPath(gateway(from), gateway(to)), to.at])
  if (mode === 'rail' && from.at[1] > 70 && to.at[1] < 35) return densify([from.at, ...RAIL, to.at], 2)
  return densify([from.at, to.at])
}

export interface Measured { points: LatLng[]; cum: number[]; total: number }
export function measure(points: LatLng[]): Measured {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + angle(points[i - 1], points[i]))
  return { points, cum, total: cum[cum.length - 1] || 1 }
}
export function pointAt(m: Measured, t: number): { at: LatLng; index: number } {
  const d = Math.min(1, Math.max(0, t)) * m.total
  let i = 1
  while (i < m.cum.length - 1 && m.cum[i] < d) i++
  const seg = m.cum[i] - m.cum[i - 1] || 1, f = (d - m.cum[i - 1]) / seg
  const a = m.points[i - 1], b = m.points[i] ?? a
  let dl = b[1] - a[1]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360
  return { at: [a[0] + (b[0] - a[0]) * f, a[1] + dl * f], index: i }
}
/** A reported position, as a share of the route: the nearest point on it. */
export function progressOf(m: Measured, at: LatLng): number {
  let best = 0, min = Infinity
  m.points.forEach((p, i) => { const d = angle(p, at); if (d < min) { min = d; best = i } })
  return m.cum[best] / m.total
}
