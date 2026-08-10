// ─── Curated demo 3D models ───────────────────────────────────────────────────
// The mesh twin of demo-models/point-clouds.ts, and it follows the same sourcing
// policy:
//
//   • Consumed EXTERNALLY via stable raw URLs — no large binaries in this repo.
//   • Every host serves `Access-Control-Allow-Origin: *`, verified per URL.
//   • Sources are long-lived public corpora: the Khronos glTF Sample Assets
//     (CC0 / CC-BY, the reference set every glTF implementation is tested
//     against) and the three.js examples models (MIT).
//
// Every number below was MEASURED by running the file through this app's own
// `loadMeshFiles` in a browser — triangle counts, texture counts, byte totals,
// bounding sizes, and what the unit and up-axis heuristics actually decided.
// None of it is copied from an upstream description. If a file is replaced
// upstream the numbers are what will drift, so re-measure rather than editing by
// hand.
//
// ── Each entry earns its place by exercising something different
//   1. `box`          — the simplest thing that can work. 12 triangles, no
//                       textures. If this fails, nothing else will tell you why.
//   2. `duck-draco`   — Draco-compressed geometry across THREE files (.gltf +
//                       .bin + .png). Declares KHR_draco_mesh_compression in
//                       extensionsRequired, so it cannot parse at all without a
//                       decoder — and its texture is referenced by a relative
//                       path, which is what proves basename resolution works.
//                       30 kB for all three.
//   3. `helmet`       — a self-contained PBR GLB with five 2K textures. The one
//                       that shows what an import is FOR: it looks like
//                       something. Also the one that shows why the texture
//                       budget matters — those five maps are ~110 MB on the GPU
//                       from a 3.8 MB download.
//   4. `human-figure` — deliberately the awkward one. See below.
//
// ── Why a demo that imports WRONG is the most useful one here
// `human-figure` is 182 units tall. A person is 1.82 m, so the file is in
// CENTIMETRES — and the unit heuristic reads it as metres, because 182 is a
// perfectly plausible number of metres for something (a tower, a bridge span)
// and there is nothing in the file that says otherwise. The up-axis heuristic
// gets it wrong too, and for a reason worth understanding: it assumes what
// people model is WIDER THAN IT IS TALL, which holds for a room, a floor or a
// site and inverts for anything standing up.
//
// Both are marked `assumed` in the panel and both are one control away from
// right. Shipping a demo that lands perfectly teaches nobody where those
// controls are; this one teaches it in about four seconds. Its card says so
// rather than leaving the user to think the importer is broken.

/** What a demo is chosen to demonstrate — drives the card's one-line pitch. */
export type MeshDemoKind =
  | 'minimal'
  /** Compressed geometry that cannot parse without a decoder. */
  | 'draco'
  /** Textured PBR — what an import is actually for. */
  | 'textured'
  /** Imports wrong on purpose, to show the unit and up-axis controls. */
  | 'corrections'

export interface DemoMesh {
  /** Stable id (kebab-case). Used for analytics + React keys. */
  id: string
  /** Short human title shown on the card. */
  name: string
  /** i18n key under `demos.items` for the one-line description. */
  descriptionKey: string
  kind: MeshDemoKind
  /**
   * Every URL the model needs, entry file FIRST.
   *
   * A .gltf without its .bin and its images is grey geometry, and an .obj
   * without its .mtl is untextured — so a demo that listed only the entry file
   * would demonstrate the failure rather than the feature.
   */
  urls: string[]
  /** Sum of every file, measured. Shown so nobody is surprised by the download. */
  totalBytes: number
  /** Measured by decoding the file, not read from a header. */
  triangles: number
  textures: number
  /** Rough GPU cost of those textures — the reason the budget exists. */
  textureBytes: number
  /** Attribution shown on the card. These are other people's models. */
  license: string
  source: string
}

const KHRONOS = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models'
const THREEJS = 'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/obj/male02'

export const DEMO_MESHES: readonly DemoMesh[] = [
  {
    id: 'box',
    name: 'Box',
    descriptionKey: 'box',
    kind: 'minimal',
    urls: [`${KHRONOS}/Box/glTF-Binary/Box.glb`],
    totalBytes: 1_664,
    triangles: 12,
    textures: 0,
    textureBytes: 0,
    license: 'CC0',
    source: 'Khronos glTF Sample Assets',
  },
  {
    id: 'duck-draco',
    name: 'Duck (Draco)',
    descriptionKey: 'duckDraco',
    kind: 'draco',
    urls: [
      `${KHRONOS}/Duck/glTF-Draco/Duck.gltf`,
      `${KHRONOS}/Duck/glTF-Draco/Duck.bin`,
      `${KHRONOS}/Duck/glTF-Draco/DuckCM.png`,
    ],
    totalBytes: 30_467,
    triangles: 4_212,
    textures: 1,
    textureBytes: 1_394_606,
    license: 'CC-BY 4.0 (Sony)',
    source: 'Khronos glTF Sample Assets',
  },
  {
    id: 'helmet',
    name: 'Damaged Helmet',
    descriptionKey: 'helmet',
    kind: 'textured',
    urls: [`${KHRONOS}/DamagedHelmet/glTF-Binary/DamagedHelmet.glb`],
    totalBytes: 3_773_916,
    triangles: 15_452,
    textures: 5,
    textureBytes: 111_568_486,
    license: 'CC-BY 4.0 (ctxwing / theblueturtle_)',
    source: 'Khronos glTF Sample Assets',
  },
  {
    id: 'human-figure',
    name: 'Human figure (OBJ)',
    descriptionKey: 'humanFigure',
    kind: 'corrections',
    urls: [
      `${THREEJS}/male02.obj`,
      `${THREEJS}/male02.mtl`,
      // Uppercase extensions, exactly as the .mtl asks for them. Basename
      // matching is case-insensitive precisely because exporters and
      // filesystems disagree about this constantly.
      `${THREEJS}/01_-_Default1noCulling.JPG`,
      `${THREEJS}/male-02-1noCulling.JPG`,
      `${THREEJS}/orig_02_-_Defaul1noCulling.JPG`,
    ],
    totalBytes: 652_633,
    triangles: 5_004,
    textures: 5,
    textureBytes: 0,
    license: 'MIT',
    source: 'three.js examples',
  },
]

/** Bytes → a short human string, for the card. */
export function formatDemoSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

/**
 * Fetch every file a demo needs, in parallel.
 *
 * Parallel because a model with five textures would otherwise serialise five
 * round trips to the same host, and the first thing anyone notices about a demo
 * is how long it takes.
 *
 * `onProgress` counts FILES, not bytes: raw.githubusercontent.com does not send
 * a length for everything, so a byte-based bar would stall at an arbitrary point
 * and look broken.
 */
export async function fetchDemoMesh(
  demo: DemoMesh,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<File[]> {
  let done = 0
  const files = await Promise.all(demo.urls.map(async (url) => {
    const res = await fetch(url, { signal: opts.signal, cache: 'force-cache' })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url.split('/').pop()}`)
    const bytes = await res.arrayBuffer()
    done++
    opts.onProgress?.(done / demo.urls.length)
    return new File([bytes], url.split('/').pop() ?? 'model.glb')
  }))
  return files
}
