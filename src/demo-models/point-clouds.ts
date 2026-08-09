// ─── Curated demo point clouds ────────────────────────────────────────────────
// The point cloud twin of demo-models/models.ts, and it follows the same
// sourcing policy:
//
//   • Consumed EXTERNALLY via stable raw URLs — no large binaries in this repo.
//   • Every host serves `Access-Control-Allow-Origin: *`, so the browser fetches
//     them directly (verified against raw.githubusercontent.com).
//   • Sources are long-lived public repos. These are the PDAL project's test
//     corpus: real survey data, openly published, and stable for years.
//
// Every field below was read out of the actual file rather than copied from a
// description — point counts, byte sizes, CRS codes, units and which classes are
// present. If a file is replaced upstream the numbers are what will drift, so
// re-derive them rather than editing by hand.
//
// HONESTY NOTE, and it matters for what these demos can show: these are aerial
// and mobile LiDAR surveys of real places. None of them is a scan OF the demo
// IFC buildings, so loading one next to a demo model lands on the bottom rung of
// the alignment ladder ("placed by hand") — which is the correct answer, and is
// exactly what the panel will tell the user. They demonstrate reading, rendering,
// colour modes, classification, units and LOD. They cannot demonstrate a matched
// scan-to-model alignment, because no such public pair exists.

/** What a demo is useful for showing — drives the card's one-line pitch. */
export type PointCloudDemoKind = 'colour' | 'classification' | 'units' | 'scale'

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
const PDAL_SOURCE = 'https://github.com/PDAL/PDAL/tree/master/test/data'

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
]

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
