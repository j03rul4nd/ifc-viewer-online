// ─── Curated demo point clouds ────────────────────────────────────────────────
// The point cloud twin of demo-models/models.ts, and it follows the same
// sourcing policy:
//
//   • Consumed EXTERNALLY via stable raw URLs — no large binaries in this repo.
//   • Every host serves `Access-Control-Allow-Origin: *`, so the browser fetches
//     them directly (verified per URL, including the LFS media host).
//   • Sources are long-lived public repos: the PDAL project's test corpus and
//     sample-data repo (CC BY 4.0), and the Point Cloud Library's sample data
//     (BSD). Real survey data, openly published, stable for years.
//
// Every field below was read out of the actual file rather than copied from a
// description — point counts, byte sizes, CRS codes, units, and whether colour
// and classification are really THERE rather than merely allowed by the point
// format. If a file is replaced upstream the numbers are what will drift, so
// re-derive them rather than editing by hand.
//
// ── Two traps that a header alone will not warn you about
//   1. A LAS point format that permits RGB does not mean the file has any. Both
//      `red-rocks` (PDRF 3) and `lone-star` (PDRF 6) declare a classification
//      byte and every single point in them is class 0. `hasClassification` below
//      is what the DECODED points carry, not what the format allows.
//   2. Half the public .laz corpus is compressed with the pointwise LASzip
//      variant (compressor 1 in the `laszip encoded` VLR), which laz-perf cannot
//      read at all — it throws out of WASM and the user sees `error.lazDecode`.
//      Several otherwise perfect coloured candidates were rejected for this.
//      Before adding a .laz, decode it, do not just parse its header.
//
// HONESTY NOTE, and it matters for what these demos can show: the public scans
// below are captures of real places, and none of them is a scan OF a demo IFC
// model, so loading one next to one lands on the bottom rung of the alignment
// ladder ("placed by hand") — which is the correct answer, and is exactly what
// the panel will tell the user. They demonstrate reading, rendering, colour
// modes, classification, units and LOD. They cannot demonstrate a matched
// scan-to-model alignment, because no such public pair exists.
//
// ONE EXCEPTION, and it is the last entry: `poblenou-site-scan` is ours. It is
// generated (scripts/pointcloud/build-site-scan.mjs) alongside the Poblenou
// Pavilion reference models and written in the SAME projected CRS at the same
// eastings and northings, so it reaches the TOP rung — shared CRS — and lands
// on the model without anybody dragging anything. It is synthetic, and its card
// says so; that is the price of being able to show the alignment at all.

/** What a demo is useful for showing — drives the card's one-line pitch. */
export type PointCloudDemoKind =
  | 'colour' | 'classification' | 'units' | 'scale' | 'octree'
  /** Ours, and the only one that can: a scan of a demo model, in its CRS. */
  | 'alignment'

export interface DemoPointCloud {
  /** Stable id (kebab-case). Used for analytics + React keys. */
  id: string
  /** Short human title shown on the card. */
  name: string
  /** i18n key under `demos.items` for the one-line description. */
  descriptionKey: string
  kind: PointCloudDemoKind
  /** Filename used to construct the File object + the manual-placement key. */
  fileName: string
  /** Fetch URL (external, CORS-enabled). */
  url: string
  /** Human-facing attribution / "view source" link. */
  sourceUrl: string
  /** Short attribution label. */
  sourceLabel: string
  /** Exact byte size — drives the download progress and the size label. */
  sizeBytes: number
  /** Points the header declares. */
  pointCount: number
  /** LAS version + point data record format, e.g. "LAS 1.2 · PDRF 3". */
  format: string
  /** What the file actually carries, read from it. Shown as chips on the card. */
  hasColor: boolean
  hasClassification: boolean
  /** Declared linear unit, or null when the file does not say. */
  unit: 'm' | 'ft' | 'usft' | null
  /** EPSG code the file declares, or null. See the honesty note above. */
  epsg: number | null
  featured?: boolean
}

const PDAL = 'https://raw.githubusercontent.com/PDAL/PDAL/master/test/data/las'
const PDAL_LAZ = 'https://raw.githubusercontent.com/PDAL/PDAL/master/test/data/laz'
const PDAL_COPC = 'https://raw.githubusercontent.com/PDAL/PDAL/master/test/data/copc'
const PDAL_SOURCE = 'https://github.com/PDAL/PDAL/tree/master/test/data'

// PDAL's sample-data repo keeps its point clouds in Git LFS, so the `raw.` host
// serves a 133-byte pointer file. `media.` is the LFS blob endpoint, and it is
// the one that returns the actual bytes (with `Access-Control-Allow-Origin: *`).
const PDAL_DATA = 'https://media.githubusercontent.com/media/PDAL/data/main'
const PDAL_DATA_SOURCE = 'https://github.com/PDAL/data'

const PCL = 'https://raw.githubusercontent.com/PointCloudLibrary/data/master/tutorials'
const PCL_SEG = 'https://raw.githubusercontent.com/PointCloudLibrary/data/master/segmentation/mOSD/learn'
const PCL_SOURCE = 'https://github.com/PointCloudLibrary/data'

/**
 * The one scan that ships with the app rather than being fetched from someone
 * else's repo, because it is a survey of OUR reference building and lives
 * beside it. See docs/REFERENCE_IFC.md.
 */
const BUNDLED_POBLENOU = `${import.meta.env.BASE_URL}models/poblenou/poblenou-site-scan.las`

export const DEMO_POINT_CLOUDS: DemoPointCloud[] = [
  {
    id: 'autzen-stadium',
    name: 'Autzen Stadium — aerial LiDAR',
    descriptionKey: 'autzen',
    kind: 'colour',
    // The LAZ of the same survey: 603 kB instead of 3.7 MB for identical data
    // (6.2× — verified by decoding both and comparing point for point).
    fileName: 'autzen_trim.laz',
    url: `${PDAL_LAZ}/autzen_trim.laz`,
    sourceUrl: PDAL_SOURCE,
    sourceLabel: 'PDAL test data',
    sizeBytes: 603_353,
    pointCount: 110_000,
    format: 'LAZ · PDRF 3',
    hasColor: true,
    hasClassification: true,
    // Esri-flavoured WKT with no authority on the PROJCS — the reader correctly
    // reports no CRS rather than picking up the unit's EPSG:9002.
    unit: 'ft',
    epsg: null,
    featured: true,
  },
  {
    id: 'red-rocks',
    name: 'Red Rocks — drone survey in true colour',
    descriptionKey: 'redRocks',
    kind: 'colour',
    fileName: 'red-rocks.laz',
    url: `${PDAL_DATA}/entwine/data/red-rocks.laz`,
    sourceUrl: PDAL_DATA_SOURCE,
    sourceLabel: 'PDAL sample data (CC BY 4.0)',
    sizeBytes: 10_188_197,
    pointCount: 4_004_326,
    format: 'LAZ · PDRF 3',
    hasColor: true,
    // Decoded, not assumed: the RGB is 8-bit and populated on ~100% of points,
    // while every point is class 0 and every intensity is 0. Colour is all this
    // file has, which is exactly what a photogrammetric cloud looks like.
    hasClassification: false,
    unit: 'm',
    epsg: 26_913,
    featured: true,
  },
  {
    id: 'colour-and-classes',
    name: 'Colourised aerial — every attribute at once',
    descriptionKey: 'sampleC',
    kind: 'colour',
    fileName: 'sample_c.las',
    url: `${PDAL}/sample_c.las`,
    sourceUrl: PDAL_SOURCE,
    sourceLabel: 'PDAL test data',
    sizeBytes: 490_099,
    pointCount: 14_408,
    format: 'LAS 1.2 · PDRF 3',
    hasColor: true,
    // Eight distinct codes decoded: 2, 3, 4, 5, 6, 11, 14 and 31.
    hasClassification: true,
    unit: null,
    epsg: null,
  },
  {
    id: 'new-mexico-ground',
    name: 'New Mexico — ground survey',
    descriptionKey: 'newMexico',
    kind: 'units',
    fileName: '4_6.las',
    url: `${PDAL}/4_6.las`,
    sourceUrl: PDAL_SOURCE,
    sourceLabel: 'PDAL test data',
    sizeBytes: 5_971_566,
    pointCount: 198_975,
    format: 'LAS 1.4 · PDRF 6',
    hasColor: false,
    hasClassification: true,
    unit: 'usft',
    epsg: 2903,
    featured: true,
  },
  {
    id: 'mvk-classified',
    name: 'Mississippi Valley — classified',
    descriptionKey: 'mvk',
    kind: 'classification',
    fileName: 'mvk-thin.las',
    url: `${PDAL}/mvk-thin.las`,
    sourceUrl: PDAL_SOURCE,
    sourceLabel: 'PDAL test data',
    sizeBytes: 179_154,
    pointCount: 6_280,
    format: 'LAS 1.2 · PDRF 1',
    hasColor: false,
    hasClassification: true,
    unit: 'usft',
    epsg: 26_995,
  },
  {
    id: 'lone-star-copc',
    name: 'Lone Star Geyser — terrestrial COPC',
    descriptionKey: 'loneStar',
    kind: 'octree',
    fileName: 'lone-star.copc.laz',
    url: `${PDAL_COPC}/lone-star.copc.laz`,
    sourceUrl: PDAL_SOURCE,
    sourceLabel: 'PDAL test data',
    sizeBytes: 2_705_193,
    pointCount: 518_862,
    format: 'COPC · PDRF 6',
    hasColor: false,
    // Root node decoded: 58,393 points, all class 0, intensity up to 2649.
    hasClassification: false,
    unit: 'm',
    // The file's WKT calls itself a geocentric CRS while its coordinates are
    // plainly UTM 12N eastings/northings, so no authority code can be trusted
    // out of it and the panel says "No CRS" rather than guessing one.
    epsg: null,
  },
  {
    id: 'tabletop-objects',
    name: 'Tabletop objects — colour and per-point labels',
    descriptionKey: 'tabletop',
    kind: 'colour',
    fileName: 'learn0.pcd',
    url: `${PCL_SEG}/learn0.pcd`,
    sourceUrl: PCL_SOURCE,
    sourceLabel: 'PCL sample data',
    sizeBytes: 1_839_104,
    pointCount: 307_200,
    format: 'PCD · binary_compressed',
    hasColor: true,
    // The PCD `label` field, which the reader maps onto classification: three
    // codes here (1, 20, 30), separating the objects from the table.
    hasClassification: true,
    unit: null,
    epsg: null,
    // ORGANISED grid: the header declares 640 × 480 = 307,200 slots, and the
    // pixels that caught no return are written as NaN. 182,292 points survive
    // the reader's finite check here (259,847 in the room capture below). The
    // field is the DECLARED count by definition, so it stays as written, and
    // the copy tells the user the grid is part-empty.
  },
  {
    id: 'indoor-room',
    name: 'Indoor corner — RGB-D capture',
    descriptionKey: 'indoorRoom',
    kind: 'colour',
    fileName: 'region_growing_rgb_tutorial.pcd',
    url: `${PCL}/region_growing_rgb_tutorial.pcd`,
    sourceUrl: PCL_SOURCE,
    sourceLabel: 'PCL sample data',
    sizeBytes: 2_286_562,
    pointCount: 307_200,
    format: 'PCD · binary_compressed',
    hasColor: true,
    hasClassification: false,
    unit: null,
    epsg: null,
  },
  {
    id: 'warsaw-small',
    name: 'Warsaw — coloured sample',
    descriptionKey: 'warsaw',
    kind: 'scale',
    fileName: 'warsaw_small.las',
    url: `${PDAL}/warsaw_small.las`,
    sourceUrl: PDAL_SOURCE,
    sourceLabel: 'PDAL test data',
    sizeBytes: 102_284,
    pointCount: 3_000,
    format: 'LAS 1.2 · PDRF 3',
    hasColor: true,
    hasClassification: true,
    unit: null,
    epsg: null,
  },
  {
    id: 'poblenou-site-scan',
    name: 'Poblenou Pavilion — site survey',
    descriptionKey: 'poblenou',
    kind: 'alignment',
    fileName: 'poblenou-site-scan.las',
    url: BUNDLED_POBLENOU,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/pointcloud/build-site-scan.mjs',
    sourceLabel: 'Generated with the Poblenou models',
    sizeBytes: 3_900_313,
    pointCount: 150_000,
    format: 'LAS 1.2 · PDRF 2',
    hasColor: true,
    hasClassification: true,
    unit: 'm',
    // The same CRS the Poblenou IfcMapConversion declares, which is the whole
    // reason this file exists — it is what gets the aligner to the top rung.
    epsg: 25_831,
    featured: true,
  },
]

/**
 * The distinct upstream corpora, in first-appearance order — the credit line
 * under the gallery. Derived rather than hand-listed so a new demo from a new
 * source can never end up silently credited to somebody else's repo.
 */
export const DEMO_SOURCES: Array<Pick<DemoPointCloud, 'sourceUrl' | 'sourceLabel'>> =
  DEMO_POINT_CLOUDS
    .filter((demo, i) => DEMO_POINT_CLOUDS.findIndex((d) => d.sourceUrl === demo.sourceUrl) === i)
    .map(({ sourceUrl, sourceLabel }) => ({ sourceUrl, sourceLabel }))

/** Human size label, matching the demo IFC gallery's formatting. */
export function formatDemoSize(bytes: number): string {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} kB`
}

/**
 * Fetch a demo cloud and hand it back as a File, so it enters the exact same
 * load path a dropped file does — no special-casing anywhere downstream.
 * `onProgress` reports 0-1 when the server sends a content length.
 */
export async function fetchDemoPointCloud(
  demo: DemoPointCloud,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<File> {
  const res = await fetch(demo.url, { signal: opts.signal, cache: 'force-cache' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  // Stream so a 6 MB download shows real progress rather than a frozen spinner.
  const total = Number(res.headers.get('content-length')) || demo.sizeBytes
  if (!res.body || !opts.onProgress) {
    const buffer = await res.arrayBuffer()
    return new File([buffer], demo.fileName)
  }

  const reader = res.body.getReader()
  const parts: Uint8Array[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    received += value.length
    opts.onProgress(Math.min(1, received / total))
  }
  return new File(parts as BlobPart[], demo.fileName)
}
