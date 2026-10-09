// ─── feed-presets ─────────────────────────────────────────────────────────────
// Public sources that work today, configured from what they were MEASURED to
// do (2026-10, see feeds.ts header and docs/CITY_DATA_SOURCES.md) — not from
// what their docs say:
//
//   source           protocol            CORS  freshness                    default
//   Bicing           GBFS 3.0            yes   ttl 0, max-age 0             30 s
//   FGC trains       Opendatasoft        yes   no-cache + 5000 req/day      30 s → quota decides
//   Rodalies         GTFS-RT JSON        NO    max-age 30, Expires, ETag    30 s, needs a proxy
//   BCN traffic      DAT # + CSV join    yes   every 5 min                  300 s
//   Endolla (EV)     GELFS JSON          yes   ports change-driven          120 s
//   ASPB air         hourly CSV + join   yes   hourly, 45 min – 3 h late    900 s
//   Meteocat XEMA    Socrata CSV + join  yes   half-hourly, ~16 min late    600 s
//   Madrid air       hourly CSV + join   yes   hourly                       900 s
//   BCN barris       CSV with WKT        yes   static                       no refresh
//   Toei stations    ODPT JSON-LD        yes   static                       no refresh
//   TMB              GeoJSON + keys      yes   static / iBus 30 s           the user's keys
//   Catastro         WFS 2.0 GML         yes   static (parcels)             no refresh
//   ICGC             WFS 2.0             yes   static (boundaries)          no refresh
//
// A preset is only a starting point: every setting stays editable on the layer.
// Each one carries the box it is useful in, so the panel offers the sources of
// the city the scene is in first.

import type { FeedKind } from './feeds'
import type { Symbology, SymbolRule } from './symbology'
import { defaultLayerStyle, defaultGroupStyle, newGroupId, type LayerStyle, type StyleGroup, type PointStyle } from './style-groups'
import type { ParseOptions as TableOptions } from './csv'
import type { JoinSpec } from './join'
import { TMB_URLS, tmbLines } from './tmb'
import type { VectorLayerData } from './geojson'
import type { RecordsSpec } from './records'
import type { TableTransform } from './table-transforms'

export interface FeedPreset {
  id: string
  /** i18n key suffix under layers:presets.<id>.{name,hint} */
  region: 'barcelona' | 'catalunya' | 'spain' | 'madrid' | 'tokyo'
  /** Where the source has data, [west, south, east, north] degrees. */
  bbox: [number, number, number, number]
  /** Needs the user's own keys for this provider (stored in their browser). */
  needsKey?: 'tmb'
  /** Static data, fetched once: styled from what it contains. */
  styleFromData?: (data: VectorLayerData) => LayerStyle
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
  join?: {
    geomUrl: string; table: TableOptions; spec: JoinSpec; timeColumn?: string
    timeZone?: string; transforms?: TableTransform[]; geomUnique?: boolean
  }
  /** JSON records with an explicit place mapping (otherwise sniffed). */
  records?: RecordsSpec
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

/** TMB lines: one group per line, in TMB's order and official colour. */
function tmbLineStyle(widthM: number) {
  return (data: VectorLayerData): LayerStyle => {
    const base = defaultLayerStyle('#888888')
    return {
      ...base,
      groups: tmbLines(data.features).map((l) => {
        const g = defaultGroupStyle(l.color)
        return {
          id: newGroupId(), name: l.name, match: 'all' as const,
          filters: [{ field: 'NOM_LINIA', op: 'eq' as const, value: l.name }],
          style: { ...g, line: { color: l.color, widthM, opacity: 1 } },
          visible: true,
        }
      }),
    }
  }
}

/** TMB points (stops, stations): one icon, named when close enough. */
function tmbPointStyle(icon: 'bus' | 'metro', color: string, labelField: string) {
  return (): LayerStyle => {
    const base = defaultLayerStyle(color)
    return { ...base, fallback: { ...base.fallback, point: { symbol: { kind: 'icon', icon }, color, size: 3, labelField } } }
  }
}

const rule = (value: string, color: string, icon: SymbolRule['symbol'], label?: string): SymbolRule =>
  ({ value, color, symbol: icon, sizeM: 4, visible: true, label })

const fallback = (color: string, symbol: SymbolRule['symbol']): Symbology['fallback'] =>
  ({ color, symbol, sizeM: 4, visible: true })

const TMB_LICENSE = 'TMB · Transports Metropolitans de Barcelona (developer.tmb.cat)'

const BCN_BBOX: [number, number, number, number] = [2.05, 41.31, 2.24, 41.47]
const CAT_BBOX: [number, number, number, number] = [0.15, 40.5, 3.35, 42.9]
const SPAIN_BBOX: [number, number, number, number] = [-18.2, 27.6, 4.4, 43.9]
const MADRID_BBOX: [number, number, number, number] = [-3.89, 40.31, -3.52, 40.56]
const TOKYO_BBOX: [number, number, number, number] = [139.5, 35.5, 140.0, 35.85]

const group = (name: string, color: string, filters: StyleGroup['filters'], point?: Partial<PointStyle>): StyleGroup => {
  const g = defaultGroupStyle(color)
  return { id: newGroupId(), name, match: 'all', filters, style: { ...g, point: { ...g.point, ...point, color } }, visible: true }
}

/**
 * EV charging locations by what a driver needs now. The labels say ports,
 * never "chargers": a GELFS location can hold several stations.
 */
function evStyle(t: (k: string) => string): LayerStyle {
  const base = defaultLayerStyle('#8a8f98')
  const icon: Partial<PointStyle> = { symbol: { kind: 'icon', icon: 'charger' }, size: 5, labelField: 'name' }
  return {
    ...base,
    groups: [
      group(t('ev.available'), '#22c55e', [{ field: 'state', op: 'eq', value: 'available' }], icon),
      group(t('ev.busy'), '#f59e0b', [{ field: 'state', op: 'eq', value: 'busy' }], icon),
      group(t('ev.outOfService'), '#ef4444', [{ field: 'state', op: 'eq', value: 'out_of_service' }], icon),
    ],
    fallback: { ...base.fallback, point: { ...base.fallback.point, ...icon, color: '#8a8f98' } },
  }
}

/**
 * Air quality coloured by NO₂ with the bands of the European Air Quality Index
 * (EEA, hourly NO₂ µg/m³: 40 / 90 / 120 / 230 / 340). It colours ONE
 * pollutant, it does not compute an index: every measured pollutant stays an
 * attribute, and the groups are ordinary groups the user can re-target.
 */
function airStyle(t: (k: string) => string, field = 'NO2'): LayerStyle {
  const base = defaultLayerStyle('#8a8f98')
  const pt: Partial<PointStyle> = { symbol: { kind: 'icon', icon: 'sensor' }, size: 5, labelField: field }
  const bands: Array<[string, string, number | null]> = [
    ['air.good', '#50f0e6', 40], ['air.fair', '#50ccaa', 90], ['air.moderate', '#f0e641', 120],
    ['air.poor', '#ff5050', 230], ['air.veryPoor', '#960032', 340], ['air.extremelyPoor', '#7d2181', null],
  ]
  return {
    ...base,
    groups: bands.map(([key, color, below]) => group(`${field} · ${t(key)}`, color,
      below === null ? [{ field, op: 'gte', value: 340 }] : [{ field, op: 'lt', value: below }], pt)),
    fallback: { ...base.fallback, point: { ...base.fallback.point, ...pt, color: '#8a8f98' } },
  }
}

/** Weather stations coloured by air temperature, 5 °C bands. */
function temperatureStyle(field = 'temp_c'): LayerStyle {
  const base = defaultLayerStyle('#8a8f98')
  const pt: Partial<PointStyle> = { symbol: { kind: 'icon', icon: 'sensor' }, size: 5, labelField: field }
  const bands: Array<[string, string, number | null]> = [
    ['< 0 °C', '#3b4cc0', 0], ['0 – 5 °C', '#5d7ce6', 5], ['5 – 10 °C', '#82a6fb', 10], ['10 – 15 °C', '#aac7fd', 15],
    ['15 – 20 °C', '#f2cbb7', 20], ['20 – 25 °C', '#f7a889', 25], ['25 – 30 °C', '#e26952', 30], ['≥ 30 °C', '#b40426', null],
  ]
  return {
    ...base,
    groups: bands.map(([name, color, below]) => group(name, color,
      below === null ? [{ field, op: 'gte', value: 30 }] : [{ field, op: 'lt', value: below }], pt)),
    fallback: { ...base.fallback, point: { ...base.fallback.point, ...pt, color: '#8a8f98' } },
  }
}

/** Neighbourhoods: a light fill, an outline and the name. */
function areaStyle(color: string, labelField: string) {
  return (): LayerStyle => {
    const base = defaultLayerStyle(color)
    return {
      ...base,
      fallback: {
        ...base.fallback,
        area: { ...base.fallback.area, fillOpacity: 0.12, outline: true },
        point: { ...base.fallback.point, labelField },
      },
    }
  }
}

/**
 * Pollutant codes of the Spanish exchange format (the same in Barcelona's
 * ASPB file and Madrid's real-time CSV). Internal analyser channels (99x)
 * and the starred duplicates are left out on purpose.
 */
const POLLUTANTS: Record<string, string> = {
  1: 'SO2', 6: 'CO', 7: 'NO', 8: 'NO2', 9: 'PM2_5', 10: 'PM10', 12: 'NOx', 14: 'O3', 20: 'toluene', 22: 'black_carbon', 30: 'benzene',
}

/** Meteocat XEMA variable codes (dataset 4fb2-n3yi). */
const XEMA_VARIABLES: Record<string, string> = {
  30: 'wind_ms', 31: 'wind_dir_deg', 32: 'temp_c', 33: 'humidity_pct', 34: 'pressure_hpa', 35: 'precip_mm_30min', 36: 'irradiance_wm2', 50: 'gust_ms',
}

const OPEN_DATA_BCN = 'Ajuntament de Barcelona · Open Data BCN (CC BY 4.0)'

export const FEED_PRESETS: FeedPreset[] = [
  {
    id: 'tmb-metro-lines', region: 'barcelona', bbox: BCN_BBOX, kind: 'geojson', url: TMB_URLS.metroLines,
    needsKey: 'tmb', license: TMB_LICENSE, styleFromData: tmbLineStyle(8),
  },
  {
    id: 'tmb-metro-stations', region: 'barcelona', bbox: BCN_BBOX, kind: 'geojson', url: TMB_URLS.metroStations,
    needsKey: 'tmb', license: TMB_LICENSE, styleFromData: tmbPointStyle('metro', '#DC241F', 'NOM_ESTACIO'),
  },
  {
    id: 'tmb-bus-lines', region: 'barcelona', bbox: BCN_BBOX, kind: 'geojson', url: TMB_URLS.busLines,
    needsKey: 'tmb', license: TMB_LICENSE, styleFromData: tmbLineStyle(3),
  },
  {
    id: 'tmb-bus-stops', region: 'barcelona', bbox: BCN_BBOX, kind: 'geojson', url: TMB_URLS.busStops,
    needsKey: 'tmb', license: TMB_LICENSE, styleFromData: tmbPointStyle('bus', '#DC241F', 'NOM_PARADA'),
  },
  {
    id: 'bcn-traffic', region: 'barcelona', bbox: BCN_BBOX, kind: 'join',
    // The live STATUS table (every 5 min); the geometry joins onto it.
    url: 'https://opendata-ajuntament.barcelona.cat/data/dataset/8319c2b1-4c21-4962-9acd-6db4c5ff1148/resource/2d456eb5-4ea6-4f68-9794-2f3f1a58a933/download',
    intervalS: 300, license: 'Ajuntament de Barcelona · Open Data BCN (CC BY 4.0)',
    join: {
      geomUrl: 'https://opendata-ajuntament.barcelona.cat/data/dataset/1090983a-1c40-4609-8620-14ad49aae3ab/resource/1d6c814c-70ef-4147-aa16-a49ddb952f72/download/transit_relacio_trams.csv',
      table: { delimiter: '#', header: false, columns: ['tram', 'time', 'estat', 'previst'] },
      spec: { layerKey: 'Tram', tableKey: 'tram' },
      timeColumn: 'time',
      timeZone: 'Europe/Madrid',
    },
    layerStyle: (t) => trafficStyle(t),
  },
  {
    id: 'bicing', region: 'barcelona', bbox: BCN_BBOX, kind: 'gbfs',
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
    id: 'fgc', region: 'catalunya', bbox: CAT_BBOX, kind: 'ods',
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
    id: 'rodalies', region: 'catalunya', bbox: CAT_BBOX, kind: 'gtfs-rt',
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
    // GELFS: one file with every location AND its ports' live status. The
    // records adapter summarises each location (state, ports, max kW).
    id: 'bcn-endolla', region: 'barcelona', bbox: BCN_BBOX, kind: 'geojson',
    url: 'https://opendata-ajuntament.barcelona.cat/data/dataset/8cdafa08-d378-4bf1-aad4-fafffe815940/resource/9febc26f-d6a7-45f2-8f73-f529ba4da930/download',
    intervalS: 120, license: `${OPEN_DATA_BCN} · Endolla, B:SM`,
    layerStyle: (t) => evStyle(t),
  },
  {
    // ASPB: today and the three days before, one row per station × pollutant
    // × day with 24 hour columns. Reshaped to the latest valid hour per
    // pollutant and joined to the stations file (which lists each station once
    // per pollutant it measures — hence geomUnique).
    id: 'bcn-air-quality', region: 'barcelona', bbox: BCN_BBOX, kind: 'join',
    url: 'https://opendata-ajuntament.barcelona.cat/resources/aspb/Qualitat_Aire_Detall.csv',
    intervalS: 900, license: `${OPEN_DATA_BCN} · ASPB`,
    join: {
      // Published per year: the current year's file lists the stations in service.
      geomUrl: 'https://opendata-ajuntament.barcelona.cat/data/dataset/4dff88b1-151b-48db-91c2-45007cd5d07a/resource/7de4c08f-5962-4d4d-9dca-e10badffbffd/download/2026_qualitat_aire_estacions.csv',
      table: { header: true },
      spec: { layerKey: 'Estacio', tableKey: 'ESTACIO' },
      timeColumn: 'time',
      transforms: [{ op: 'hourly-wide', key: 'ESTACIO', variable: 'CODI_CONTAMINANT', timeZone: 'Europe/Madrid', names: POLLUTANTS }],
      geomUnique: true,
    },
    layerStyle: (t) => airStyle(t),
  },
  {
    // Meteocat XEMA: half-hourly readings in long format, UTC without a zone.
    // The {now-3h} window keeps the query under a second (Socrata scans the
    // whole table otherwise).
    id: 'cat-meteocat', region: 'catalunya', bbox: CAT_BBOX, kind: 'join',
    url: "https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.csv?$select=codi_estacio,codi_variable,data_lectura,valor_lectura&$where=data_lectura%20%3E%20'{now-3h:floating}'%20AND%20codi_variable%20in('30','31','32','33','34','35','36','50')&$order=data_lectura%20DESC&$limit=8000",
    intervalS: 600, license: 'Servei Meteorològic de Catalunya (Meteocat) · dades obertes de la Generalitat',
    join: {
      geomUrl: "https://analisi.transparenciacatalunya.cat/resource/yqwd-vj5e.csv?$where=nom_estat_ema='Operativa'&$limit=1000",
      table: { header: true },
      spec: { layerKey: 'codi_estacio', tableKey: 'codi_estacio' },
      timeColumn: 'time',
      transforms: [{ op: 'latest-pivot', key: 'codi_estacio', column: 'codi_variable', value: 'valor_lectura', time: 'data_lectura', timeZone: 'UTC', names: XEMA_VARIABLES }],
    },
    layerStyle: () => temperatureStyle(),
  },
  {
    id: 'bcn-barris', region: 'barcelona', bbox: BCN_BBOX, kind: 'geojson',
    url: 'https://opendata-ajuntament.barcelona.cat/data/dataset/808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/b21fa550-56ea-4f4c-9adc-b8009381896e/download',
    license: OPEN_DATA_BCN, styleFromData: areaStyle('#7c8cff', 'nom_barri'),
  },
  {
    // The same national exchange format as Barcelona's ASPB file: the
    // transform is shared, only the column names change.
    id: 'madrid-air-quality', region: 'madrid', bbox: MADRID_BBOX, kind: 'join',
    url: 'https://ciudadesabiertas.madrid.es/dynamicAPI/API/query/calair_tiemporeal.csv?pageSize=5000',
    intervalS: 900, license: 'Ayuntamiento de Madrid · datos.madrid.es',
    join: {
      geomUrl: 'https://datos.madrid.es/egob/catalogo/212629-1-estaciones-control-aire.csv',
      table: { header: true },
      spec: { layerKey: 'CODIGO_CORTO', tableKey: 'ESTACION' },
      timeColumn: 'time',
      transforms: [{ op: 'hourly-wide', key: 'ESTACION', variable: 'MAGNITUD', timeZone: 'Europe/Madrid', names: POLLUTANTS }],
    },
    layerStyle: (t) => airStyle(t),
  },
  {
    // ODPT's key-less endpoint serves Toei (Tokyo Metropolitan Bureau of
    // Transportation) only. JSON-LD records with geo:lat / geo:long.
    id: 'tokyo-toei-stations', region: 'tokyo', bbox: TOKYO_BBOX, kind: 'geojson',
    url: 'https://api-public.odpt.org/api/v4/odpt:Station?odpt:operator=odpt.Operator:Toei',
    license: 'Bureau of Transportation, Tokyo Metropolitan Government, via ODPT (CC BY 4.0)',
    styleFromData: tmbPointStyle('metro', '#2e9b43', 'dc:title'),
  },
  {
    id: 'catastro', region: 'spain', bbox: SPAIN_BBOX, kind: 'wfs',
    url: 'https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx', typeName: 'cp:CadastralParcel',
    radiusM: 250, license: 'Dirección General del Catastro',
  },
  {
    id: 'icgc-municipis', region: 'catalunya', bbox: CAT_BBOX, kind: 'wfs',
    url: 'https://geoserveis.icgc.cat/servei/catalunya/divisions-administratives/wfs',
    typeName: 'divisions_administratives_wfs:divisions_administratives_municipis_5000',
    radiusM: 5000, license: 'ICGC (CC BY 4.0)',
  },
]

/**
 * The presets worth showing first for a site: those whose box contains it,
 * most local first (a city's own sources before its region's and country's).
 * Without a site every preset is "near" — there is nothing to rank by.
 */
export function presetsForSite(site: { lat: number; lon: number } | null): { near: FeedPreset[]; other: FeedPreset[] } {
  if (!site) return { near: FEED_PRESETS, other: [] }
  const area = (p: FeedPreset): number => (p.bbox[2] - p.bbox[0]) * (p.bbox[3] - p.bbox[1])
  const inside = (p: FeedPreset): boolean =>
    site.lon >= p.bbox[0] && site.lon <= p.bbox[2] && site.lat >= p.bbox[1] && site.lat <= p.bbox[3]
  // Ready to connect first (no key, no proxy), then the most local; stable
  // otherwise, so presets of one city keep their list order.
  const blocked = (p: FeedPreset): number => (p.needsKey || p.needsProxy ? 1 : 0)
  const near = FEED_PRESETS.filter(inside).sort((a, b) => blocked(a) - blocked(b) || area(a) - area(b))
  return { near, other: FEED_PRESETS.filter((p) => !inside(p)) }
}
