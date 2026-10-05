// ─── raster-sources ───────────────────────────────────────────────────────────
// The raster half of our map "provider". There is no server of ours: the
// provider IS this mixer, running in the browser. Each surface tile is
// composed from public sources read directly (all verified CORS-open,
// `Access-Control-Allow-Origin: *`, 2026-10-03), then our vector cartography
// is painted on top. Nothing is stored, nothing is proxied, nothing costs.
//
//   OpenFreeMap (OSM vectors) ── geometry, names      ─┐
//   PNOA (IGN, ortophoto ES)  ── imagery, 15–25 cm     ├─► one 512 px tile
//   Catastro INSPIRE (WMS)    ── parcels, footprints  ─┘
//
// Licences, as data like providers.ts: PNOA is CC-BY 4.0 (commercial use
// allowed, attribution "PNOA cedido por © IGN"); Catastro data is free reuse
// with attribution ("Dirección General del Catastro"). Both are Spanish
// coverage only — outside the bbox they are simply not requested.

export interface RasterSource {
  id: 'pnoa' | 'cadastre' | 'hillshade'
  attribution: string
  /** lon/lat box where the source has data — outside it, no request. */
  coverage: { west: number; south: number; east: number; north: number }
  minzoom: number
  maxzoom: number
  /**
   * URLs that tile one 512 px surface tile, with their place on the canvas
   * (fractions of the canvas, 0–1).
   */
  urlsFor(z: number, x: number, y: number): Array<{ url: string; fx: number; fy: number; fw: number; fh: number }>
  /** A source computed in the browser rather than fetched as-is. */
  load?(z: number, x: number, y: number, signal?: AbortSignal): Promise<LoadedRaster[]>
}

const SPAIN = { west: -18.4, south: 27.5, east: 4.6, north: 44.0 }
const HALF_WORLD_M = 20037508.342789244

/** Web-mercator metres of an XYZ tile (y down, as XYZ counts it). */
export function tileBoundsMercator(z: number, x: number, y: number): [number, number, number, number] {
  const size = (2 * HALF_WORLD_M) / 2 ** z
  const minX = -HALF_WORLD_M + x * size
  const maxY = HALF_WORLD_M - y * size
  return [minX, maxY - size, minX + size, maxY]
}

export function tileLonLatBounds(z: number, x: number, y: number): { west: number; south: number; east: number; north: number } {
  const n = 2 ** z
  const lon = (tx: number) => (tx / n) * 360 - 180
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI
  return { west: lon(x), east: lon(x + 1), north: lat(y), south: lat(y + 1) }
}

export function intersects(a: RasterSource['coverage'], b: RasterSource['coverage']): boolean {
  return a.west < b.east && a.east > b.west && a.south < b.north && a.north > b.south
}

export const PNOA: RasterSource = {
  id: 'pnoa',
  attribution: 'PNOA cedido por © Instituto Geográfico Nacional de España (CC-BY 4.0)',
  coverage: SPAIN,
  minzoom: 6,
  maxzoom: 20,
  // WMTS 256 px tiles one level deeper fill a 512 px surface tile exactly —
  // and WMTS tiles are CDN-cached, which a WMS GetMap is not.
  urlsFor(z, x, y) {
    const out = []
    const cz = Math.min(z + 1, 20)
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const col = x * 2 + dx, row = y * 2 + dy
        out.push({
          url: 'https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0'
            + '&layer=OI.OrthoimageCoverage&style=default&format=image/jpeg&tilematrixset=GoogleMapsCompatible'
            + `&tilematrix=${cz}&tilerow=${row}&tilecol=${col}`,
          fx: dx / 2, fy: dy / 2, fw: 0.5, fh: 0.5,
        })
      }
    }
    return out
  },
}

export const CADASTRE: RasterSource = {
  id: 'cadastre',
  attribution: 'Catastro © Dirección General del Catastro',
  coverage: SPAIN,
  // Parcels mean nothing at city scale and would be a dense hatch; from z16 a
  // parcel is tens of pixels wide.
  minzoom: 16,
  maxzoom: 22,
  // WMS straight in web-mercator at exactly the surface tile's box and size:
  // no reprojection, no resampling, one request per tile.
  urlsFor(z, x, y) {
    const [x0, y0, x1, y1] = tileBoundsMercator(z, x, y)
    return [{
      url: 'https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
        + '&LAYERS=CP.CadastralParcel&STYLES=&CRS=EPSG:3857'
        + `&BBOX=${x0.toFixed(2)},${y0.toFixed(2)},${x1.toFixed(2)},${y1.toFixed(2)}`
        + '&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=true',
      fx: 0, fy: 0, fw: 1, fh: 1,
    }]
  },
}

// ── Hillshade: relief computed in the browser ─────────────────────────────────
// Terrarium elevation (AWS open data, world, CORS-open — the same tiles the 3D
// terrain patch reads, so the browser cache serves both) turned into a
// shaded-relief layer here, per tile. No service renders it for us; it is a
// few ms of arithmetic on 65k samples.

const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
/** Deepest elevation level read: past z13 the 30 m DEM only adds noise. */
const HILLSHADE_DATA_MAX_Z = 13
const EARTH_CIRCUMFERENCE_M = 40075016.686

/** Terrarium RGB → metres. */
export function terrariumHeight(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768
}

/**
 * Shaded relief of an n×n height grid, as the ALPHA of a dark wash
 * (multiply-ready): 0 on flat or lit ground, rising to 1 in full shade. Light
 * from the north-west at 45° — the cartographic convention, not the scene's
 * sun: relief shading is a reading aid, and NW light is what makes valleys
 * read as valleys (south-east light inverts them for most readers).
 */
export function hillshadeAlpha(h: Float32Array, n: number, cellM: number, zFactor: number): Float32Array {
  const out = new Float32Array(n * n)
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180
  const lx = Math.sin(az) * Math.cos(alt), ly = Math.cos(az) * Math.cos(alt), lz = Math.sin(alt)
  const at = (x: number, y: number) => h[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))]
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dzdx = ((at(x + 1, y) - at(x - 1, y)) / (2 * cellM)) * zFactor
      // Image rows grow south; the north neighbour is y − 1.
      const dzdy = ((at(x, y - 1) - at(x, y + 1)) / (2 * cellM)) * zFactor
      const len = Math.hypot(dzdx, dzdy, 1)
      const shade = (-dzdx * lx - dzdy * ly + lz) / len // Lambert; = lz on flat ground
      // Flat ground gets no wash at all: only relief darkens.
      out[y * n + x] = Math.min(1, Math.max(0, (lz - shade) / lz))
    }
  }
  return out
}

export const HILLSHADE: RasterSource = {
  id: 'hillshade',
  attribution: 'Relief: Mapzen Terrarium (AWS Open Data; SRTM, GMTED, ETOPO1)',
  coverage: { west: -180, south: -85.06, east: 180, north: 85.06 },
  minzoom: 4,
  // In a city at z16+ relief is a degree or two: a wash would only stain.
  maxzoom: 15,
  urlsFor(z, x, y) {
    const dz = Math.min(z, HILLSHADE_DATA_MAX_Z)
    const k = 2 ** (z - dz)
    return [{ url: `${TERRARIUM}/${dz}/${Math.floor(x / k)}/${Math.floor(y / k)}.png`, fx: 0, fy: 0, fw: 1, fh: 1 }]
  },
  async load(z, x, y, signal) {
    const dz = Math.min(z, HILLSHADE_DATA_MAX_Z)
    const k = 2 ** (z - dz)
    const [req] = HILLSHADE.urlsFor(z, x, y)
    try {
      const res = await fetch(req.url, { signal, mode: 'cors' })
      if (!res.ok) return []
      const bmp = await createImageBitmap(await res.blob())
      const n = bmp.width
      const ctx = new OffscreenCanvas(n, n).getContext('2d', { willReadFrequently: true })
      if (!ctx) { bmp.close(); return [] }
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
      const px = ctx.getImageData(0, 0, n, n)
      const h = new Float32Array(n * n)
      for (let i = 0; i < n * n; i++) h[i] = terrariumHeight(px.data[i * 4], px.data[i * 4 + 1], px.data[i * 4 + 2])
      const b = tileLonLatBounds(dz, Math.floor(x / k), Math.floor(y / k))
      const cellM = (EARTH_CIRCUMFERENCE_M * Math.cos((((b.north + b.south) / 2) * Math.PI) / 180)) / 2 ** dz / n
      // Far out, relief is a few pixels of a mountain range: exaggerate it so
      // it reads; close in, keep it true.
      const zFactor = 1 + Math.max(0, 11 - z) * 0.45
      const a = hillshadeAlpha(h, n, cellM, zFactor)
      for (let i = 0; i < n * n; i++) {
        // A cool grey-violet wash — a black multiply would muddy the greens.
        px.data[i * 4] = 70; px.data[i * 4 + 1] = 72; px.data[i * 4 + 2] = 92
        px.data[i * 4 + 3] = Math.round(a[i] * 255)
      }
      ctx.putImageData(px, 0, 0)
      const image = await createImageBitmap(ctx.canvas)
      // An overzoomed tile shows its part of the data tile, stretched to fill.
      const sx = x % k, sy = y % k
      return [{ image, fx: -sx, fy: -sy, fw: k, fh: k }]
    } catch {
      return []
    }
  },
}

export const RASTER_SOURCES = { pnoa: PNOA, cadastre: CADASTRE, hillshade: HILLSHADE } as const

/** What a style asks of a source, and where it goes in the paint order. */
export interface RasterUse {
  source: RasterSource['id']
  /**
   * under  — right after the background (imagery);
   * relief — after the ground fills, before any road (hillshade);
   * over   — after all geometry, before the labels (parcels).
   */
  placement: 'under' | 'relief' | 'over'
  opacity: number
  blend?: GlobalCompositeOperation
}


/** The requests a source needs for surface tile z/x/y (empty when out of range or coverage). */
export function plannedRequests(src: RasterSource, z: number, x: number, y: number) {
  if (z < src.minzoom || z > src.maxzoom) return []
  if (!intersects(src.coverage, tileLonLatBounds(z, x, y))) return []
  return src.urlsFor(z, x, y)
}

export interface LoadedRaster {
  image: ImageBitmap
  fx: number; fy: number; fw: number; fh: number
}

/**
 * Fetch and decode a source's images for one tile. A failed piece is dropped,
 * never thrown: an imagery gap must leave the vector map, not a broken tile.
 */
export async function loadRaster(
  src: RasterSource, z: number, x: number, y: number, signal?: AbortSignal,
): Promise<LoadedRaster[]> {
  if (src.load) {
    if (z < src.minzoom || z > src.maxzoom) return []
    if (!intersects(src.coverage, tileLonLatBounds(z, x, y))) return []
    return src.load(z, x, y, signal)
  }
  const reqs = plannedRequests(src, z, x, y)
  const results = await Promise.all(reqs.map(async (r) => {
    try {
      const res = await fetch(r.url, { signal, mode: 'cors' })
      if (!res.ok) return null
      const blob = await res.blob()
      if (!blob.type.startsWith('image/')) return null // WMS errors come back as XML
      const image = await createImageBitmap(blob)
      return { image, fx: r.fx, fy: r.fy, fw: r.fw, fh: r.fh }
    } catch {
      return null
    }
  }))
  return results.filter((r): r is LoadedRaster => r !== null)
}
