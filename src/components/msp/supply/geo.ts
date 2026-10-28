// ─── Routes for the import tracker ───────────────────────────────────────────
// Ports, airports and rail terminals a buyer can pick, and the lanes between
// them, as rough great-circle waypoints: enough for a map, not navigation.
// The demo's own route (Yantian → Valencia, HKG → BCN, Xi'an → Madrid) is the
// default and reproduces the original waypoints exactly.

export type LatLng = [number, number]

export interface Terminal { id: string; name: string; at: LatLng }

// China side
export const ORIGIN_PORTS: Record<string, Terminal & { approach: LatLng[] }> = {
  yantian: { id: 'yantian', name: 'Port of Yantian', at: [22.57, 114.27], approach: [[20.5, 113.5]] },
  shanghai: { id: 'shanghai', name: 'Port of Shanghai', at: [31.36, 121.6], approach: [[30.2, 123.0], [24.5, 120.0], [20.5, 113.5]] },
  ningbo: { id: 'ningbo', name: 'Port of Ningbo-Zhoushan', at: [29.94, 121.85], approach: [[29.5, 122.8], [24.5, 120.0], [20.5, 113.5]] },
  qingdao: { id: 'qingdao', name: 'Port of Qingdao', at: [36.07, 120.32], approach: [[35.0, 122.5], [30.2, 123.0], [24.5, 120.0], [20.5, 113.5]] },
  xiamen: { id: 'xiamen', name: 'Port of Xiamen', at: [24.45, 118.07], approach: [[23.0, 117.0], [20.5, 113.5]] },
}
export const ORIGIN_AIRPORTS: Record<string, Terminal> = {
  hkg: { id: 'hkg', name: 'Hong Kong airport (HKG)', at: [22.31, 113.92] },
  pvg: { id: 'pvg', name: 'Shanghai Pudong (PVG)', at: [31.14, 121.8] },
  can: { id: 'can', name: 'Guangzhou Baiyun (CAN)', at: [23.39, 113.3] },
}
export const ORIGIN_RAIL: Record<string, Terminal> = {
  xian: { id: 'xian', name: 'Xi’an rail terminal', at: [34.34, 108.94] },
  chongqing: { id: 'chongqing', name: 'Chongqing rail terminal', at: [29.62, 106.5] },
  yiwu: { id: 'yiwu', name: 'Yiwu rail terminal', at: [29.31, 120.08] },
}

// Europe side
const SEA_CORE: LatLng[] = [[13.5, 109.8], [6.5, 105.5], [1.25, 103.85], [5.9, 95.3], [6.9, 79.8], [12.6, 51.5], [12.6, 43.4], [20.5, 38.4], [27.9, 33.8], [29.95, 32.55], [31.3, 32.3], [33.6, 25.5]]
const CAPE_CORE: LatLng[] = [[13.5, 109.8], [6.5, 105.5], [1.25, 103.85], [-6.0, 95.0], [-20.0, 75.0], [-30.0, 45.0], [-35.2, 20.0], [-30.0, 10.0], [-10.0, 0.0], [10.0, -18.0], [28.0, -16.0]]
const MED_IN: LatLng[] = [[36.0, -6.0], [36.2, -2.0]]
const NORTH_IN: LatLng[] = [[43.5, -9.8], [48.5, -5.5], [50.0, 1.0]]

export const DEST_PORTS: Record<string, Terminal & { suez: LatLng[]; cape: LatLng[] }> = {
  valencia: { id: 'valencia', name: 'Port of Valencia', at: [39.44, -0.32], suez: [[36.6, 13.2], [38.6, 4.5]], cape: [...MED_IN] },
  barcelona: { id: 'barcelona', name: 'Port of Barcelona', at: [41.35, 2.17], suez: [[36.6, 13.2], [38.6, 4.5]], cape: [...MED_IN, [37.5, 1.0]] },
  algeciras: { id: 'algeciras', name: 'Port of Algeciras', at: [36.13, -5.44], suez: [[36.6, 13.2], [37.5, 1.0], [36.2, -2.0]], cape: [[36.0, -6.0]] },
  genoa: { id: 'genoa', name: 'Port of Genoa', at: [44.4, 8.92], suez: [[36.6, 13.2], [41.5, 9.0]], cape: [...MED_IN, [37.5, 1.0], [41.5, 9.0]] },
  piraeus: { id: 'piraeus', name: 'Port of Piraeus', at: [37.94, 23.6], suez: [], cape: [...MED_IN, [37.5, 1.0], [36.6, 13.2]] },
  rotterdam: { id: 'rotterdam', name: 'Port of Rotterdam', at: [51.95, 4.1], suez: [[36.6, 13.2], [37.5, 1.0], [36.0, -5.6], ...NORTH_IN], cape: [...NORTH_IN] },
  antwerp: { id: 'antwerp', name: 'Port of Antwerp', at: [51.3, 4.3], suez: [[36.6, 13.2], [37.5, 1.0], [36.0, -5.6], ...NORTH_IN, [51.4, 3.3]], cape: [...NORTH_IN, [51.4, 3.3]] },
  hamburg: { id: 'hamburg', name: 'Port of Hamburg', at: [53.54, 9.97], suez: [[36.6, 13.2], [37.5, 1.0], [36.0, -5.6], ...NORTH_IN, [53.9, 8.6]], cape: [...NORTH_IN, [53.9, 8.6]] },
  felixstowe: { id: 'felixstowe', name: 'Port of Felixstowe', at: [51.95, 1.35], suez: [[36.6, 13.2], [37.5, 1.0], [36.0, -5.6], ...NORTH_IN], cape: [...NORTH_IN] },
}
const AIR_CORE: LatLng[] = [[30.5, 104.0], [39.5, 75.9], [41.3, 69.3], [41.0, 49.5], [41.0, 29.0]]
export const DEST_AIRPORTS: Record<string, Terminal & { tail: LatLng[] }> = {
  bcn: { id: 'bcn', name: 'Barcelona airport (BCN)', at: [41.3, 2.08], tail: [[42.0, 13.0]] },
  mad: { id: 'mad', name: 'Madrid airport (MAD)', at: [40.47, -3.56], tail: [[42.0, 13.0]] },
  fra: { id: 'fra', name: 'Frankfurt airport (FRA)', at: [50.03, 8.57], tail: [[46.5, 20.0]] },
  ams: { id: 'ams', name: 'Amsterdam airport (AMS)', at: [52.31, 4.76], tail: [[48.0, 20.0]] },
  cdg: { id: 'cdg', name: 'Paris CDG airport', at: [49.01, 2.55], tail: [[46.5, 16.0]] },
  mxp: { id: 'mxp', name: 'Milan Malpensa (MXP)', at: [45.63, 8.72], tail: [[44.0, 16.0]] },
  lhr: { id: 'lhr', name: 'London Heathrow (LHR)', at: [51.47, -0.45], tail: [[48.0, 20.0]] },
}
const RAIL_CORE: LatLng[] = [[36.06, 103.8], [43.8, 87.6], [44.2, 80.4], [43.25, 76.9], [43.65, 51.2], [40.4, 49.9], [41.7, 44.8], [41.0, 29.0], [45.0, 20.0]]
export const DEST_RAIL: Record<string, Terminal & { tail: LatLng[] }> = {
  madrid: { id: 'madrid', name: 'Madrid rail terminal', at: [40.39, -3.69], tail: [[46.2, 6.1], [41.4, 2.17]] },
  duisburg: { id: 'duisburg', name: 'Duisburg rail terminal', at: [51.43, 6.76], tail: [[48.2, 16.4], [50.1, 8.7]] },
  lodz: { id: 'lodz', name: 'Łódź rail terminal', at: [51.76, 19.46], tail: [[48.2, 19.0]] },
  milan: { id: 'milan', name: 'Milan rail terminal', at: [45.48, 9.2], tail: [[46.0, 14.5]] },
  hamburgRail: { id: 'hamburgRail', name: 'Hamburg rail terminal', at: [53.55, 10.0], tail: [[48.2, 16.4], [51.0, 13.7]] },
}

export interface RouteChoice { originPort: string; originAirport: string; originRail: string; destPort: string; destAirport: string; destRail: string }
export const DEFAULT_ROUTE: RouteChoice = { originPort: 'yantian', originAirport: 'hkg', originRail: 'xian', destPort: 'valencia', destAirport: 'bcn', destRail: 'madrid' }

const pick = <T,>(m: Record<string, T>, id: string, d: string): T => m[id] ?? m[d]

export interface Lanes { sea: LatLng[]; cape: LatLng[]; air: LatLng[]; rail: LatLng[] }

/** The four main legs for a route choice, terminal to terminal. */
export function lanesFor(r: RouteChoice): Lanes {
  const op = pick(ORIGIN_PORTS, r.originPort, 'yantian'), dp = pick(DEST_PORTS, r.destPort, 'valencia')
  const oa = pick(ORIGIN_AIRPORTS, r.originAirport, 'hkg'), da = pick(DEST_AIRPORTS, r.destAirport, 'bcn')
  const or = pick(ORIGIN_RAIL, r.originRail, 'xian'), dr = pick(DEST_RAIL, r.destRail, 'madrid')
  return {
    sea: [op.at, ...op.approach, ...SEA_CORE, ...dp.suez, dp.at],
    cape: [op.at, ...op.approach, ...CAPE_CORE, ...dp.cape, dp.at],
    air: [oa.at, ...AIR_CORE, ...da.tail, da.at],
    rail: [or.at, ...RAIL_CORE, ...dr.tail, dr.at],
  }
}

export function terminals(r: RouteChoice) {
  return {
    originPort: pick(ORIGIN_PORTS, r.originPort, 'yantian'), originAirport: pick(ORIGIN_AIRPORTS, r.originAirport, 'hkg'), originRail: pick(ORIGIN_RAIL, r.originRail, 'xian'),
    destPort: pick(DEST_PORTS, r.destPort, 'valencia'), destAirport: pick(DEST_AIRPORTS, r.destAirport, 'bcn'), destRail: pick(DEST_RAIL, r.destRail, 'madrid'),
  }
}

/** A short form for messages: "Yantian", "HKG", "Xi’an". */
export function shortName(t: Terminal): string {
  const m = t.name.match(/\(([A-Z]{3})\)/)
  if (m) return m[1]
  return t.name.replace(/^Port of /, '').replace(/ rail terminal$/, '').replace(/ airport$/, '')
}
