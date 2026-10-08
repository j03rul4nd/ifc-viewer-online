// ─── symbology ────────────────────────────────────────────────────────────────
// How a layer's features LOOK, decided by the user — because the same Point
// can be a railway station, an electrical substation or a fire exit, and
// nothing in GeoJSON says which.
//
// A layer is drawn either with one style, or by RULES on one field:
//   field "kind":  station    → train icon, blue
//                  substation → bolt icon, yellow
//                  exit       → exit icon, green
//                  (anything else) → default
// Each rule picks a colour and, for points, a SYMBOL: a camera-facing icon from
// the built-in catalogue, a 3D primitive, or a GLB model the user brought.
//
// Pure: no three.js. vector-mesh.ts turns resolved symbols into geometry.

import { norm } from '../twin/twin-index'
import type { FlatProp, FieldSchema } from '../twin/flatten-props'

export type PrimitiveShape = 'sphere' | 'pin' | 'cube' | 'cylinder' | 'cone'

export type IconId =
  | 'train' | 'metro' | 'bus' | 'tram' | 'power' | 'exit' | 'door' | 'sensor' | 'camera'
  | 'warning' | 'info' | 'parking' | 'water' | 'fire' | 'tree' | 'building' | 'pin' | 'wifi' | 'bike' | 'charger'

export const ICON_IDS: IconId[] = [
  'pin', 'train', 'metro', 'tram', 'bus', 'bike', 'charger', 'power', 'exit', 'door', 'sensor', 'camera',
  'wifi', 'warning', 'info', 'fire', 'water', 'parking', 'tree', 'building',
]

export const PRIMITIVES: PrimitiveShape[] = ['sphere', 'pin', 'cube', 'cylinder', 'cone']

export type PointSymbol =
  | { kind: 'primitive'; shape: PrimitiveShape }
  | { kind: 'icon'; icon: IconId }
  | { kind: 'model'; assetId: string }

export interface SymbolStyle {
  color: string
  symbol: PointSymbol
  /** Point symbol size, metres (icon diameter, primitive height, model scale target). */
  sizeM: number
}

export interface SymbolRule extends SymbolStyle {
  /** Field value this rule matches (compared accent- and case-insensitively). */
  value: string
  /** Optional display name; defaults to the value. */
  label?: string
  visible: boolean
}

export interface Symbology {
  /** Flat field path the rules key on ("kind", "asset.type"), or null for one style. */
  field: string | null
  rules: SymbolRule[]
  /** Everything no rule matched. */
  fallback: SymbolStyle & { visible: boolean }
}

export const DEFAULT_POINT_SYMBOL: PointSymbol = { kind: 'primitive', shape: 'sphere' }

export function singleSymbology(color: string, sizeM = 4): Symbology {
  return { field: null, rules: [], fallback: { color, symbol: DEFAULT_POINT_SYMBOL, sizeM, visible: true } }
}

/** The style for one feature, and whether it is shown at all. */
export function resolveSymbol(props: FlatProp[], s: Symbology): (SymbolStyle & { ruleIndex: number }) | null {
  if (s.field) {
    const v = props.find((p) => p.field === s.field && p.value !== null && !p.joined)
    if (v) {
      const key = norm(String(v.value))
      const i = s.rules.findIndex((r) => norm(r.value) === key)
      if (i >= 0) return s.rules[i].visible ? { ...s.rules[i], ruleIndex: i } : null
    }
  }
  return s.fallback.visible ? { ...s.fallback, ruleIndex: -1 } : null
}

// ── Suggestions ────────────────────────────────────────────────────────────────

const PALETTE = ['#2fb7ff', '#ffd23f', '#5ce27a', '#ff4f8b', '#b18cff', '#ff7a1a', '#3ee0d0', '#f25c54', '#c0ca33', '#ffffff']

/**
 * Keyword → icon, multilingual (ES/CA/EN/FR/DE/IT/PT): what a value or field
 * name most likely depicts. First match wins, so the specific comes first.
 */
const ICON_HINTS: Array<[RegExp, IconId]> = [
  [/(bicing|bici|bike|cycle|velo|fahrrad|bicicl)/, 'bike'],
  [/(charg|carga|recarr|recarg|ladesta|borne)/, 'charger'],
  [/(subesta|substa|transforma|electric|electri|power|energ|strom|umspann|trafo|cuadro|quadre|switchgear)/, 'power'],
  [/(salida|sortida|exit|emergenc|evacua|ausgang|uscita|saida|sorti)/, 'exit'],
  [/(puerta|porta|door|tur|porte|gate|acceso|acces|entrada)/, 'door'],
  [/(metro|subway|u-bahn|underground|fgc)/, 'metro'],
  [/(tram|tranvia|tramvia)/, 'tram'],
  [/(estacio|station|bahnhof|gare|stazione|rodalies|renfe|train|tren|rail|ferroc)/, 'train'],
  [/(bus|autobus|parada)/, 'bus'],
  [/(sensor|iot|device|dispositi|meter|contador|medidor)/, 'sensor'],
  [/(camara|camera|cctv|kamera|video)/, 'camera'],
  [/(wifi|antena|antenna|router|access ?point|5g|4g)/, 'wifi'],
  [/(fire|incend|hydrant|hidrant|extint|brand)/, 'fire'],
  [/(water|agua|aigua|wasser|eau|acqua|fuente|font|valve|valvula)/, 'water'],
  [/(parking|aparca|estaciona|garage)/, 'parking'],
  [/(tree|arbol|arbre|baum|arbre|albero|arvore)/, 'tree'],
  [/(warning|alarm|alerta|aviso|incid|risk|riesgo|danger|peligro)/, 'warning'],
  [/(building|edific|gebaude|batiment|edificio)/, 'building'],
  [/(info|punto de informacion|kiosk)/, 'info'],
]

export function guessIcon(text: string): IconId | null {
  const t = norm(text)
  for (const [re, icon] of ICON_HINTS) if (re.test(t)) return icon
  return null
}

/** Fields worth offering in the "style by" picker: categories first. */
export function categoryFields(schema: FieldSchema[]): FieldSchema[] {
  return schema
    .filter((f) => f.type !== 'number' && f.distinct >= 1 && f.distinct <= 40 && f.coverage >= 0.3)
    .sort((a, b) => Number(b.role === 'category') - Number(a.role === 'category') || b.coverage - a.coverage)
}

/**
 * One rule per distinct value of `field` (most frequent first, capped), each
 * with a palette colour and an icon guessed from the value — or the field name.
 */
export function autoRules(rows: FlatProp[][], field: string, base: SymbolStyle, max = 12): SymbolRule[] {
  const counts = new Map<string, { value: string; n: number }>()
  for (const props of rows) {
    const p = props.find((x) => x.field === field && x.value !== null && !x.joined)
    if (!p) continue
    const key = norm(String(p.value))
    const c = counts.get(key)
    if (c) c.n++; else counts.set(key, { value: String(p.value), n: 1 })
  }
  const fieldIcon = guessIcon(field)
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map((c, i): SymbolRule => {
      const icon = guessIcon(c.value) ?? fieldIcon
      return {
        value: c.value,
        color: PALETTE[i % PALETTE.length],
        symbol: icon ? { kind: 'icon', icon } : base.symbol,
        sizeM: base.sizeM,
        visible: true,
      }
    })
}

// ── Icon artwork ───────────────────────────────────────────────────────────────
// 24×24 stroke paths (drawn white on the rule's colour). Hand-made, no font or
// network dependency — they render the same offline, in captures and in PDFs.

export const ICON_PATHS: Record<IconId, string> = {
  bike: 'M5.5 17.5m-3.5 0a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0M18.5 17.5m-3.5 0a3.5 3.5 0 1 0 7 0 3.5 3.5 0 1 0-7 0M5.5 17.5 9 10h6l3.5 7.5M9 10l3 7.5h-6.5M12 6h3l1 4',
  charger: 'M7 3h7v18H7zM14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-2-2M11 7l-2 4h3l-2 4',
  pin: 'M12 21s-6-5.5-6-10a6 6 0 1 1 12 0c0 4.5-6 10-6 10zM12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  train: 'M7 4h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2zM5 11h14M9 15h.01M15 15h.01M8 18l-2 3M16 18l2 3',
  metro: 'M4 20V6l4 6 4-6 4 6 4-6v14M2 20h20',
  tram: 'M8 3h8M12 3v3M7 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM5 12h14M9 18l-2 3M15 18l2 3',
  bus: 'M6 3h12a2 2 0 0 1 2 2v12H4V5a2 2 0 0 1 2-2zM4 11h16M7 17v3M17 17v3M8 14h.01M16 14h.01',
  power: 'M13 2 4 14h7l-1 8 9-12h-7z',
  exit: 'M10 3H5v18h5M14 8l5 4-5 4M19 12H9',
  door: 'M6 21V3h12v18M3 21h18M14 12h.01',
  sensor: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8',
  camera: 'M4 7h3l2-3h6l2 3h3v12H4zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  warning: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01',
  fire: 'M12 22a7 7 0 0 1-7-7c0-4 4-6 4-11 3 2 5 5 5 8 1-1 2-2 2-4 2 2 3 4 3 7a7 7 0 0 1-7 7z',
  water: 'M12 3s7 7.5 7 12a7 7 0 0 1-14 0c0-4.5 7-12 7-12z',
  parking: 'M6 21V3h7a5 5 0 0 1 0 10H6',
  tree: 'M12 2 5 12h4l-3 5h12l-3-5h4zM12 17v5',
  building: 'M4 21V5l8-3 8 3v16M9 21v-4h6v4M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01',
}
