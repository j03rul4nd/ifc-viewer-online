// ─── feed-presets ─────────────────────────────────────────────────────────────
// Public sources that work today, configured from what they were MEASURED to
// do (2026-10, see feeds.ts header) — not from what their docs say:
//
//   source        protocol       CORS  freshness                    default
//   Bicing        GBFS 3.0       yes   ttl 0, max-age 0             30 s
//   FGC trains    Opendatasoft   yes   no-cache + 5000 req/day      30 s → quota decides
//   Rodalies      GTFS-RT JSON   NO    max-age 30, Expires, ETag    30 s, needs a proxy
//   Catastro      WFS 2.0 GML    yes   static (parcels)             no refresh
//   ICGC          WFS 2.0        yes   static (boundaries)          no refresh
//
// A preset is only a starting point: every setting stays editable on the layer.

import type { FeedKind } from './feeds'
import type { Symbology, SymbolRule } from './symbology'
import { defaultLayerStyle, defaultGroupStyle, newGroupId, type LayerStyle } from './style-groups'
import type { ParseOptions as TableOptions } from './csv'
import type { JoinSpec } from './join'

export interface FeedPreset {
  id: string
  /** i18n key suffix under layers:presets.<id>.{name,hint} */
  region: 'barcelona' | 'catalunya' | 'spain'
  kind: FeedKind
  url: string
  /** WFS presets: the feature type to load. */
  typeName?: string
  intervalS?: number
  radiusM?: number
  /** No CORS at the source: only works with a proxy configured. */
  needsProxy?: boolean
  license: string
  symbology?: Symbology
  /** kind 'join': geometry URL + how to read and match the status table. */
  join?: { geomUrl: string; table: TableOptions; spec: JoinSpec; timeColumn?: string }
  /** A full group style, built with the viewer's language. */
  layerStyle?: (t: (k: string) => string) => LayerStyle
}

/**
 * Barcelona's traffic states (Ajuntament, "Estat del trànsit"): 0 no data,
 * 1 very fluid … 5 congestion, 6 closed. Colours read as a traffic map does;
 * chevrons slow down as traffic thickens and stop where the road is closed.
 */
const TRAFFIC: Array<{ code: number; key: string; color: string; speed: number; flow: boolean; opacity: number }> = [
  { code: 1, key: 'veryFluid', color: '#1a9641', speed: 14, flow: true, opacity: 1 },
  { code: 2, key: 'fluid', color: '#a6d96a', speed: 10, flow: true, opacity: 1 },
  { code: 3, key: 'dense', color: '#ffd23f', speed: 5, flow: true, opacity: 1 },
  { code: 4, key: 'veryDense', color: '#fd8d3c', speed: 2.5, flow: true, opacity: 1 },
  { code: 5, key: 'congestion', color: '#d7191c', speed: 1, flow: true, opacity: 1 },
  { code: 6, key: 'closed', color: '#111111', speed: 0, flow: false, opacity: 1 },
  { code: 0, key: 'noData', color: '#6b7280', speed: 0, flow: false, opacity: 0.45 },
]

export function trafficStyle(t: (k: string) => string, field = 'estat'): LayerStyle {
  const base = defaultLayerStyle('#6b7280')
  return {
    ...base,
    groups: TRAFFIC.map((s) => {
      const g = defaultGroupStyle(s.color)
      return {
        id: newGroupId(), name: t(`traffic.${s.key}`), match: 'all' as const,
        filters: [{ field, op: 'eq' as const, value: String(s.code) }],
        style: { ...g, line: { color: s.color, widthM: 6, opacity: s.opacity, offsetM: 3.5, flow: s.flow, flowSpeed: s.speed } },
        visible: true,
      }
    }),
  }
}

const rule = (value: string, color: string, icon: SymbolRule['symbol'], label?: string): SymbolRule =>
  ({ value, color, symbol: icon, sizeM: 4, visible: true, label })

const fallback = (color: string, symbol: SymbolRule['symbol']): Symbology['fallback'] =>
  ({ color, symbol, sizeM: 4, visible: true })

export const FEED_PRESETS: FeedPreset[] = [
  {
    id: 'bcn-traffic', region: 'barcelona', kind: 'join',
    // The live STATUS table (every 5 min); the geometry joins onto it.
    url: 'https://opendata-ajuntament.barcelona.cat/data/dataset/8319c2b1-4c21-4962-9acd-6db4c5ff1148/resource/2d456eb5-4ea6-4f68-9794-2f3f1a58a933/download',
    intervalS: 300, license: 'Ajuntament de Barcelona · Open Data BCN (CC BY 4.0)',
    join: {
      geomUrl: 'https://opendata-ajuntament.barcelona.cat/data/dataset/1090983a-1c40-4609-8620-14ad49aae3ab/resource/1d6c814c-70ef-4147-aa16-a49ddb952f72/download/transit_relacio_trams.csv',
      table: { delimiter: '#', header: false, columns: ['tram', 'time', 'estat', 'previst'] },
      spec: { layerKey: 'Tram', tableKey: 'tram' },
      timeColumn: 'time',
    },
    layerStyle: (t) => trafficStyle(t),
  },
  {
    id: 'bicing', region: 'barcelona', kind: 'gbfs',
    url: 'https://barcelona.publicbikesystem.net/customer/gbfs/v3.0/gbfs.json',
    intervalS: 30, license: 'Bicing · Ajuntament de Barcelona',
    symbology: {
      field: 'state',
      rules: [
        rule('ok', '#5ce27a', { kind: 'icon', icon: 'bike' }),
        rule('low', '#ffd23f', { kind: 'icon', icon: 'bike' }),
        rule('empty', '#f25c54', { kind: 'icon', icon: 'bike' }),
        rule('full', '#2fb7ff', { kind: 'icon', icon: 'parking' }),
        rule('out_of_service', '#8a8f98', { kind: 'icon', icon: 'warning' }),
      ],
      fallback: fallback('#b18cff', { kind: 'icon', icon: 'bike' }),
    },
  },
  {
    id: 'fgc', region: 'catalunya', kind: 'ods',
    url: 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets/posicionament-dels-trens',
    intervalS: 30, radiusM: 60_000, license: 'FGC · dadesobertes.fgc.cat (CC BY 4.0)',
    symbology: {
      field: 'en_hora',
      rules: [
        rule('True', '#5ce27a', { kind: 'icon', icon: 'train' }, 'on time'),
        rule('False', '#f25c54', { kind: 'icon', icon: 'train' }, 'late'),
      ],
      fallback: fallback('#ff7a1a', { kind: 'icon', icon: 'train' }),
    },
  },
  {
    id: 'rodalies', region: 'catalunya', kind: 'gtfs-rt',
    url: 'https://gtfsrt.renfe.com/vehicle_positions.json',
    intervalS: 30, radiusM: 80_000, needsProxy: true, license: 'Renfe · data.renfe.com',
    symbology: {
      field: 'status',
      rules: [
        rule('IN_TRANSIT_TO', '#2fb7ff', { kind: 'icon', icon: 'train' }, 'in transit'),
        rule('INCOMING_AT', '#ffd23f', { kind: 'icon', icon: 'train' }, 'arriving'),
        rule('STOPPED_AT', '#5ce27a', { kind: 'icon', icon: 'train' }, 'at platform'),
      ],
      fallback: fallback('#ff7a1a', { kind: 'icon', icon: 'train' }),
    },
  },
  {
    id: 'catastro', region: 'spain', kind: 'wfs',
    url: 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx', typeName: 'cp:CadastralParcel',
    radiusM: 250, license: 'Dirección General del Catastro',
  },
  {
    id: 'icgc-municipis', region: 'catalunya', kind: 'wfs',
    url: 'https://geoserveis.icgc.cat/servei/catalunya/divisions-administratives/wfs',
    typeName: 'divisions_administratives_wfs:divisions_administratives_municipis_5000',
    radiusM: 5000, license: 'ICGC (CC BY 4.0)',
  },
]
