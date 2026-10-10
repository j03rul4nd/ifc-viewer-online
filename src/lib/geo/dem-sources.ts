// ─── dem-sources ──────────────────────────────────────────────────────────────
// Where ground heights come from. One global source, and regional ones that
// are better where they exist — chosen by the site, never by the user having
// to know which survey covers their city.
//
// Measured in central Barcelona (2026-10-09), against the stated
// IfcMapConversion.OrthogonalHeight of eight surveyed models:
//
//   point                  IFC    ICGC MET 5 m   global (terrarium)
//   Pl. Catalunya hub      20.26  20.5           34.95
//   Fonts Bessones         20.48  20.9           28.32
//   Monument a Macià       16.61  17.9           28.07
//   Pg. de Gràcia island   23.22  23.3           38.38
//
// The global mosaic is SRTM-based in cities: it measures roofs, 7–15 m high
// here, and is noisy enough to put 7 m between two points of a flat square.
// The ICGC's bare-earth model agrees with the surveyed models to within a
// metre. Same finding as the I+D package (docs/CITY_DATA_SOURCES.md).
//
// Pure.

export type DemSourceId = 'terrarium' | 'icgc-met5' | 'gsi-dem10b'

export interface DemSource {
  id: DemSourceId
  /** XYZ template ({z}/{x}/{y}, rows from the north). */
  url: string
  /** Deepest zoom the source serves; a patch asks for no more. */
  maxZoom: number
  /**
   * Where this source is trusted, [west, south, east, north]. A site must be
   * inside it with room for a terrain patch around it; undefined = anywhere.
   */
  bbox?: [number, number, number, number]
  /**
   * Several boxes instead of one, when one would take in a neighbour the
   * source does not cover (a tile that fails stops the whole terrain build).
   */
  boxes?: Array<[number, number, number, number]>
  /** Pixel → metres. `a` is alpha (0 = no data). */
  decode(r: number, g: number, b: number, a: number): number
  /**
   * A bare-earth model (buildings already removed by the survey). The global
   * mosaic is a SURFACE model and gets a morphological opening to take the
   * buildings out; applied to a bare-earth model that opening only erodes real
   * ground — measured 1.6 m too low on Passeig de Gràcia.
   */
  bareEarth: boolean
  attribution: string
}

export const TERRARIUM_SOURCE: DemSource = {
  id: 'terrarium',
  url: 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png',
  maxZoom: 15,
  // Terrarium: elevation_m = (R × 256 + G + B / 256) − 32768.
  decode: (r, g, b) => r * 256 + g + b / 256 - 32768,
  bareEarth: false,
  attribution: 'Terrain: Mapzen terrarium tiles via AWS Open Data (SRTM, USGS, ETOPO1 and others)',
}

/**
 * Institut Cartogràfic i Geològic de Catalunya, Model d'Elevacions del Terreny
 * 5 m (terrain-RGB, CC BY 4.0). Orthometric. z0–14, 256 px. Outside Catalonia
 * the service answers 0 m rather than nothing, so the box is the block the I+D
 * package used — Tarragona to Girona, inland to past Manresa — which lies
 * entirely inside Catalonia or over the sea, kept a patch's width from its
 * edges. Transparent pixels are the sea.
 */
export const ICGC_MET5_SOURCE: DemSource = {
  id: 'icgc-met5',
  url: 'https://tilemaps.icgc.cat/tileserver/tileserver/terreny-5m-30m-rgb-extent/{z}/{x}/{y}.png',
  maxZoom: 14,
  bbox: [1.45, 41.01, 2.78, 42.0],
  // Mapbox terrain-RGB: h = −10000 + (R·65536 + G·256 + B) · 0.1.
  decode: (r, g, b, a) => (a === 0 ? 0 : -10000 + (r * 65536 + g * 256 + b) * 0.1),
  bareEarth: true,
  attribution: "Terrain: Model d'Elevacions del Terreny 5 m — Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0)",
}

/**
 * Geospatial Information Authority of Japan (国土地理院), 標高タイル DEM10B
 * (dem_png): ground heights from the 1:25 000 base map, orthometric (Tokyo
 * Peil), z0–14, 256 px, keyless, CORS open. Bare earth.
 *
 * Why: the global mosaic reads 29.8 m at the Waseda tram stop, where the GSI
 * 5 m laser survey says 7.8 m (it fills the Kanda valley) — models sank or
 * floated by 20 m. DEM10B is within ~2–3 m of the laser at the demo models
 * (9.8 m at Waseda, 37.6 m at Tochōmae, I+D package, 2026-10-01).
 *
 * Encoding: v = R·2¹⁶ + G·2⁸ + B, hundredths of a metre, two's complement over
 * 24 bits; 2²³ (0x800000) = no data, which is the sea here.
 */
export const GSI_DEM10B_SOURCE: DemSource = {
  id: 'gsi-dem10b',
  url: 'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{z}/{x}/{y}.png',
  maxZoom: 14,
  // Japan's islands without Korea (Ulsan, Ulleungdo) or Russia (Vladivostok),
  // which a single Japan box would take in and GSI does not cover.
  boxes: [
    [128.5, 30.9, 131.9, 34.7],   // Kyushu, Tsushima, Gotō
    [130.8, 31.0, 134.6, 36.4],   // western Honshu, Shikoku west, Oki
    [134.5, 31.0, 142.2, 41.6],   // Honshu, Shikoku, Izu islands
    [139.3, 41.3, 146.0, 45.6],   // Hokkaido
    [122.9, 24.0, 131.5, 30.95],  // Ryūkyū (Okinawa, Amami, Yaeyama)
    [139.0, 24.0, 142.5, 31.0],   // Ogasawara
  ],
  decode: (r, g, b, a) => {
    const v = r * 65536 + g * 256 + b
    if (a === 0 || v === 0x800000) return 0
    return (v < 0x800000 ? v : v - 0x1000000) * 0.01
  },
  bareEarth: true,
  attribution: 'Terrain: 標高タイル DEM10B — 国土地理院 (Geospatial Information Authority of Japan)',
}

const REGIONAL: DemSource[] = [ICGC_MET5_SOURCE, GSI_DEM10B_SOURCE]

export function demSourceById(id: DemSourceId | undefined | null): DemSource {
  return REGIONAL.find((s) => s.id === id) ?? TERRARIUM_SOURCE
}

/** The best source for a site: a regional one that covers it, else the global one. */
export function demSourceFor(lat: number, lon: number): DemSource {
  const inside = (b: [number, number, number, number]): boolean => lon >= b[0] && lon <= b[2] && lat >= b[1] && lat <= b[3]
  return REGIONAL.find((s) => (s.boxes ?? (s.bbox ? [s.bbox] : [])).some(inside)) ?? TERRARIUM_SOURCE
}

export function demTileUrl(source: DemSource, z: number, x: number, y: number): string {
  return source.url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
}
