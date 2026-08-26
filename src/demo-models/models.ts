// ─── Curated demo IFC models ──────────────────────────────────────────────────
// Single source of truth for the demo gallery. Every demo model the app offers
// lives here — no IFC URLs are hardcoded anywhere else in the codebase.
//
// Sourcing policy (see also the PR / research notes):
//   • Most models use stable external raw URLs. Reference models and verified
//     open-data pairs may be bundled for a reliable, attributable demo.
//   • All external hosts serve `Access-Control-Allow-Origin: *`, so the browser
//     can fetch them directly (verified: raw.githubusercontent.com).
//   • Sources are long-lived public repos: buildingSMART official sample files,
//     ThatOpen engine resources, and well-known community sample collections.
//
// To add a model: append an entry below. Keep `fileName` unique (it seeds the
// OPFS cache key + the download name) and `category` one of DEMO_CATEGORIES.

import type { DemoCategory } from './categories'

export interface DemoModel {
  /** Stable id (kebab-case). Used for analytics + React keys. */
  id: string
  /** Short human title shown on the card. */
  name: string
  /** One-line description of what the model showcases. */
  description: string
  category: DemoCategory
  /** Filename used to construct the File object + OPFS cache key + downloads. */
  fileName: string
  /** Primary fetch URL (external, CORS-enabled). */
  ifcUrl: string
  /** Optional fallback fetch URL, tried if `ifcUrl` fails (e.g. bundled copy). */
  fallbackUrl?: string
  /** Human-facing attribution / "view source" link (repo or dataset page). */
  sourceUrl: string
  /** Short attribution label (repo / dataset name). */
  sourceLabel: string
  schema: 'IFC2x3' | 'IFC4' | 'IFC4x3'
  /** Human-readable approximate size, e.g. "2.4 MB". */
  approximateSize: string
  /** Exact byte size — used for the download progress bar + sorting. */
  sizeBytes: number
  /** Optional thumbnail URL (relative to BASE_URL or absolute). */
  thumbnail?: string
  /** Featured models are highlighted + sorted first in the gallery. */
  featured?: boolean
}

// Raw-host roots, kept as constants so a host migration is a one-line change.
const YOUSHENG = 'https://raw.githubusercontent.com/youshengCode/IfcSampleFiles/main'
const BIM_WHALE = 'https://raw.githubusercontent.com/andrewisen/bim-whale-ifc-samples/master'
const THATOPEN = 'https://raw.githubusercontent.com/ThatOpen/engine_components/main/resources/ifc'
const BSMART =
  'https://raw.githubusercontent.com/buildingSMART/Sample-Test-Files/master/IFC%204.3.2.0%20(IFC4X3_ADD2)/PCERT-Sample-Scene'

/** Bundled copy that ships in /public — the default demo's reliable fallback. */
const BUNDLED_DUPLEX = `${import.meta.env.BASE_URL}Ifc2x3_Duplex_Architecture.ifc`

/** The reference models. Authored here, so they ship here — see docs/REFERENCE_IFC.md. */
const BUNDLED_HELLO_WORLD = `${import.meta.env.BASE_URL}HelloWorld.ifc`
const BUNDLED_TEMPLE = `${import.meta.env.BASE_URL}JapaneseTemple.ifc`
/** The federated set — three disciplines of one building, ISO 19650 file names. */
const POBLENOU = `${import.meta.env.BASE_URL}models/poblenou`
const TORRE = `${import.meta.env.BASE_URL}models/torre-poblenou`
/** The map-mode model: on the Passeig de Lluís Companys, by the Arc de Triomf. */
const CIUTADELLA = `${import.meta.env.BASE_URL}models/ciutadella`
const CRAS = `${import.meta.env.BASE_URL}models/cras`
const VIDEO_DEMO = `${import.meta.env.BASE_URL}models/video-demo`

export const DEMO_MODELS: DemoModel[] = [
  // ── Reference ────────────────────────────────────────────────────────────
  {
    id: 'cras-feup-as-built',
    name: 'CRAS Labs @ FEUP — As-Built',
    description:
      'The real IFC counterpart to the CRAS TLS point cloud: laboratories, workshop, offices and hallway. Load the matching scan from Point cloud for a measured Scan-vs-BIM overlay.',
    category: 'Reference',
    fileName: 'model.ifc',
    ifcUrl: `${CRAS}/model.ifc`,
    sourceUrl: 'https://doi.org/10.5281/zenodo.7948116',
    sourceLabel: 'Abreu et al. · CRAS Labs (CC BY 4.0)',
    schema: 'IFC2x3',
    approximateSize: '64.4 MB',
    sizeBytes: 67_553_572,
    featured: true,
  },
  {
    id: 'hello-world',
    name: 'IFC Hello World',
    description:
      'Our reference model: three walls, one slab, one storey. Small enough to read end to end, correct by construction.',
    category: 'Reference',
    fileName: 'HelloWorld.ifc',
    ifcUrl: BUNDLED_HELLO_WORLD,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-hello-world.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '9 KB',
    sizeBytes: 9_696,
    featured: true,
  },
  {
    id: 'operations-pavilion-video',
    name: 'Operations Pavilion — IFC + Video',
    description:
      'A compact IFC4 pavilion authored for the 3D video demo. Open Tools → Video to place its matching progress loop as a screen, terrain overlay or billboard.',
    category: 'Reference',
    fileName: 'IVO-Operations-Pavilion.ifc',
    ifcUrl: `${VIDEO_DEMO}/IVO-Operations-Pavilion.ifc`,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-video-demo.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '21 KB',
    sizeBytes: 21_034,
    thumbnail: `${VIDEO_DEMO}/operations-pavilion-poster.jpg`,
    featured: true,
  },
  {
    id: 'japanese-temple',
    name: 'Japanese Temple — Main Hall',
    description:
      'The same promise at building scale: a timber-frame hondō on three levels, 92 elements, still a perfect score.',
    category: 'Reference',
    fileName: 'JapaneseTemple.ifc',
    ifcUrl: BUNDLED_TEMPLE,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-temple.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '161 KB',
    sizeBytes: 165_332,
    featured: true,
  },
  {
    id: 'poblenou-arc',
    name: 'Poblenou Pavilion — Architecture',
    description:
      'Georeferenced onto a real Barcelona plot (ETRS89 / UTM 31N) and rotated to the Cerdà grid. Load all three disciplines together.',
    category: 'Reference',
    fileName: 'BCN-IVO-ZZ-XX-M3-A-0001.ifc',
    ifcUrl: `${POBLENOU}/BCN-IVO-ZZ-XX-M3-A-0001.ifc`,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-district.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '258 KB',
    sizeBytes: 263_610,
    featured: true,
  },
  {
    id: 'poblenou-str',
    name: 'Poblenou Pavilion — Structure',
    description:
      'The frame of the same building: pad footings, a 7.2 m column grid, beams and slabs. Federates with the other two.',
    category: 'Reference',
    fileName: 'BCN-IVO-ZZ-XX-M3-S-0001.ifc',
    ifcUrl: `${POBLENOU}/BCN-IVO-ZZ-XX-M3-S-0001.ifc`,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-district.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '371 KB',
    sizeBytes: 379_754,
  },
  {
    id: 'torre-poblenou',
    name: 'Torre Poblenou',
    description:
      'A 16-storey tower on the block next to the Pavilion: stepped massing, expressed floor lines, brise-soleil, plaza and ~1,900 elements. Built to be looked at — load it in map mode.',
    category: 'Reference',
    fileName: 'BCN-IVO-ZZ-XX-M3-Z-0002.ifc',
    ifcUrl: `${TORRE}/BCN-IVO-ZZ-XX-M3-Z-0002.ifc`,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-tower.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '3.5 MB',
    sizeBytes: 3_489_029,
    featured: true,
  },
  {
    id: 'ciutadella-pavilion',
    name: 'Ciutadella Pavilion',
    description:
      'Built for map mode: an exhibition pavilion 80 m from the Arc de Triomf, turned onto the promenade axis by a real map conversion. Switch the map on and it lands between the avenue of trees, the park and the lake.',
    category: 'Reference',
    fileName: 'BCN-IVO-ZZ-XX-M3-Z-0003.ifc',
    ifcUrl: `${CIUTADELLA}/BCN-IVO-ZZ-XX-M3-Z-0003.ifc`,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-ciutadella.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '239 KB',
    sizeBytes: 245_678,
    featured: true,
  },
  {
    id: 'poblenou-mep',
    name: 'Poblenou Pavilion — Services',
    description:
      'Supply ductwork for the same building, in one IfcSystem with connected distribution ports.',
    category: 'Reference',
    fileName: 'BCN-IVO-ZZ-XX-M3-M-0001.ifc',
    ifcUrl: `${POBLENOU}/BCN-IVO-ZZ-XX-M3-M-0001.ifc`,
    sourceUrl:
      'https://github.com/j03rul4nd/ifc-viewer-online/blob/main/scripts/blender/build-district.py',
    sourceLabel: 'Authored with Blender + Bonsai',
    schema: 'IFC4',
    approximateSize: '51 KB',
    sizeBytes: 52_144,
  },

  // ── Residential ──────────────────────────────────────────────────────────
  {
    id: 'duplex-architecture',
    name: 'Duplex Apartment — Architecture',
    description: 'The classic buildingSMART duplex. Small, clean, loads instantly — the best place to start.',
    category: 'Residential',
    fileName: 'Ifc2x3_Duplex_Architecture.ifc',
    // Prefer the bundled copy (offline-safe, zero network), fall back to raw host.
    ifcUrl: BUNDLED_DUPLEX,
    fallbackUrl: `${YOUSHENG}/Ifc2x3_Duplex_Architecture.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC2x3',
    approximateSize: '2.4 MB',
    sizeBytes: 2_380_763,
    featured: true,
  },
  {
    id: 'sample-house',
    name: 'Sample House',
    description: 'A compact single-family house authored in IFC4 — good geometry and a full property set.',
    category: 'Residential',
    fileName: 'Ifc4_SampleHouse.ifc',
    ifcUrl: `${YOUSHENG}/Ifc4_SampleHouse.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC4',
    approximateSize: '2.3 MB',
    sizeBytes: 2_273_870,
  },

  // ── Commercial ───────────────────────────────────────────────────────────
  {
    id: 'office-architecture',
    name: 'Office Building — Architecture',
    description: 'A multi-storey office exported from Revit. Rich architectural detail and metadata.',
    category: 'Commercial',
    fileName: 'Ifc4_Revit_ARC.ifc',
    ifcUrl: `${YOUSHENG}/Ifc4_Revit_ARC.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC4',
    approximateSize: '14 MB',
    sizeBytes: 13_646_137,
    featured: true,
  },
  {
    id: 'tall-building',
    name: 'Tall Building',
    description: 'A slender high-rise — tiny file, great for testing storey navigation and floor plans.',
    category: 'Commercial',
    fileName: 'TallBuilding.ifc',
    ifcUrl: `${BIM_WHALE}/TallBuilding/IFC/TallBuilding.ifc`,
    sourceUrl: 'https://github.com/andrewisen/bim-whale-ifc-samples',
    sourceLabel: 'bim-whale-ifc-samples (MIT)',
    schema: 'IFC2x3',
    approximateSize: '0.6 MB',
    sizeBytes: 616_509,
  },
  {
    id: 'large-building',
    name: 'Large Building',
    description: 'A broad multi-wing building with many elements — a good mid-weight performance check.',
    category: 'Commercial',
    fileName: 'LargeBuilding.ifc',
    ifcUrl: `${BIM_WHALE}/LargeBuilding/IFC/LargeBuilding.ifc`,
    sourceUrl: 'https://github.com/andrewisen/bim-whale-ifc-samples',
    sourceLabel: 'bim-whale-ifc-samples (MIT)',
    schema: 'IFC2x3',
    approximateSize: '1.3 MB',
    sizeBytes: 1_292_595,
  },

  // ── MEP ──────────────────────────────────────────────────────────────────
  {
    id: 'duplex-electrical',
    name: 'Duplex — Electrical',
    description: 'The duplex apartment’s electrical services layer — fixtures, circuits and distribution.',
    category: 'MEP',
    fileName: 'Ifc2s3_Duplex_Electrical.ifc',
    ifcUrl: `${YOUSHENG}/Ifc2s3_Duplex_Electrical.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC2x3',
    approximateSize: '1.6 MB',
    sizeBytes: 1_602_758,
  },
  {
    id: 'duplex-mechanical',
    name: 'Duplex — Mechanical (HVAC)',
    description: 'Ducts, terminals and air-handling for the duplex apartment — a dense MEP geometry set.',
    category: 'MEP',
    fileName: 'Ifc2x3_Duplex_Mechanical.ifc',
    ifcUrl: `${YOUSHENG}/Ifc2x3_Duplex_Mechanical.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC2x3',
    approximateSize: '8.8 MB',
    sizeBytes: 8_781_887,
  },
  {
    id: 'office-mep',
    name: 'Office Building — MEP',
    description: 'Full mechanical/electrical/plumbing services for an office — the heaviest demo, a real stress test.',
    category: 'MEP',
    fileName: 'Ifc4_Revit_MEP.ifc',
    ifcUrl: `${YOUSHENG}/Ifc4_Revit_MEP.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC4',
    approximateSize: '29 MB',
    sizeBytes: 29_165_277,
  },

  // ── Structural ───────────────────────────────────────────────────────────
  {
    id: 'office-structure',
    name: 'Office Building — Structure',
    description: 'The structural frame of the office — columns, beams, slabs and foundations in IFC4.',
    category: 'Structural',
    fileName: 'Ifc4_Revit_STR.ifc',
    ifcUrl: `${YOUSHENG}/Ifc4_Revit_STR.ifc`,
    sourceUrl: 'https://github.com/youshengCode/IfcSampleFiles',
    sourceLabel: 'youshengCode / IfcSampleFiles',
    schema: 'IFC4',
    approximateSize: '11 MB',
    sizeBytes: 11_285_247,
    featured: true,
  },
  {
    id: 'school-structure',
    name: 'School — Structural Frame',
    description: 'A school’s structural model from the ThatOpen engine resources — clean steel/concrete framing.',
    category: 'Structural',
    fileName: 'school_str.ifc',
    ifcUrl: `${THATOPEN}/school_str.ifc`,
    sourceUrl: 'https://github.com/ThatOpen/engine_components',
    sourceLabel: 'ThatOpen / engine_components',
    schema: 'IFC4',
    approximateSize: '8.6 MB',
    sizeBytes: 8_593_426,
  },

  // ── Infrastructure ───────────────────────────────────────────────────────
  {
    id: 'infra-bridge',
    name: 'Concrete Bridge',
    description: 'An IFC4.3 infrastructure bridge from the official buildingSMART certification scene. Alignment-based.',
    category: 'Infrastructure',
    fileName: 'Infra-Bridge.ifc',
    ifcUrl: `${BSMART}/Infra-Bridge.ifc`,
    sourceUrl: 'https://github.com/buildingSMART/Sample-Test-Files',
    sourceLabel: 'buildingSMART / Sample-Test-Files',
    schema: 'IFC4x3',
    approximateSize: '1.9 MB',
    sizeBytes: 1_883_289,
  },
]

/** The model auto-loaded by the "Load demo model" quick action. */
export const DEFAULT_DEMO_MODEL: DemoModel =
  DEMO_MODELS.find((m) => m.id === 'duplex-architecture') ?? DEMO_MODELS[0]

/** Set of demo filenames — lets analytics tag any of them as `source: 'demo'`. */
export const DEMO_FILENAMES: ReadonlySet<string> = new Set(DEMO_MODELS.map((m) => m.fileName))

/** Categories that actually have at least one model (drives the gallery chips). */
export function activeCategories(): DemoCategory[] {
  const present = new Set(DEMO_MODELS.map((m) => m.category))
  // Preserve the canonical order from categories.ts.
  return (['Reference', 'Residential', 'Commercial', 'Industrial', 'MEP', 'Structural', 'Infrastructure'] as DemoCategory[])
    .filter((c) => present.has(c))
}

/** Demo models, featured first, otherwise in declaration order. */
export function sortedDemoModels(): DemoModel[] {
  return [...DEMO_MODELS].sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
}
