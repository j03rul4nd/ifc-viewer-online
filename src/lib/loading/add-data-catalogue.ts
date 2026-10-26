// ─── Add data catalogue ───────────────────────────────────────────────────────
// The cards of the "+ Add data" hub and the legend of the drop overlay, as
// data. Pure: the flags come in as arguments, the extension tables come from
// drop-routing / video-types, so the hub, the overlay and the drop routing
// cannot disagree about which file goes where. See docs/ADD_DATA.md.

import {
  IFC_EXTENSIONS,
  IDS_EXTENSIONS,
  LAYER_FILE_ACCEPT,
  MESH_ENTRY_EXTENSIONS,
  MESH_SIDECAR_EXTENSIONS,
  MESH_TEXTURE_EXTENSIONS,
  POINTCLOUD_EXTENSIONS,
  SCENE_FILE_SUFFIX,
  VECTOR_EXTENSIONS,
} from './drop-routing'
import { VIDEO_ACCEPT, VIDEO_FILE_EXTENSIONS } from '../video/video-types'
import type { DataPanelKind } from '../ui/data-panels'

export type AddDataKind = 'pointcloud' | 'video' | 'ifc' | 'mesh' | 'map' | 'layers' | 'devices' | 'scene'
export type AddDataGroup = 'capture' | 'models' | 'context' | 'scenes'

export interface AddDataFlags {
  pointcloud: boolean
  video: boolean
  mesh: boolean
  gis: boolean
}

export interface AddDataCard {
  kind: AddDataKind
  group: AddDataGroup
  /** browse = multi-file picker; browseOne = single file; setUpMap / connect open a panel. */
  primary: 'browse' | 'browseOne' | 'setUpMap' | 'connect'
  secondary: 'samples' | 'liveAndDemo' | 'demos' | 'sources' | null
  /** Panel behind the "N in the scene · Open panel" line and the panel actions. */
  panel: DataPanelKind | null
  /** Display codes ('LAS', 'MP4', '.scene.json'). Not translated. */
  formats: string[]
  /** Disabled until an IFC model is in the scene. */
  needsModel: boolean
}

const LAYER_EXTENSIONS = ['.geojson', '.json', '.csv', '.tsv'] as const
const MESH_FORMAT_EXTENSIONS = [...MESH_ENTRY_EXTENSIONS] as const

/** '.las' → 'LAS'; the scene suffix stays literal so it reads as a file name. */
export function formatCodes(exts: readonly string[]): string[] {
  return exts.map((ext) => ext === SCENE_FILE_SUFFIX ? ext : ext.replace(/^\./, '').toUpperCase())
}

/** Point-cloud codes without the ambiguous text formats doubling as layer codes. */
const POINTCLOUD_CODES = formatCodes(POINTCLOUD_EXTENSIONS.filter((e) => e !== '.txt' && e !== '.asc' && e !== '.csv'))

export function addDataCatalogue(flags: AddDataFlags): AddDataCard[] {
  const cards: (AddDataCard | false)[] = [
    flags.pointcloud && {
      kind: 'pointcloud', group: 'capture', primary: 'browse', secondary: 'samples', panel: 'pointcloud',
      formats: POINTCLOUD_CODES, needsModel: false,
    },
    flags.video && {
      kind: 'video', group: 'capture', primary: 'browse', secondary: 'liveAndDemo', panel: 'video',
      formats: formatCodes(VIDEO_FILE_EXTENSIONS), needsModel: false,
    },
    {
      kind: 'ifc', group: 'models', primary: 'browse', secondary: 'demos', panel: null,
      formats: formatCodes(IFC_EXTENSIONS), needsModel: false,
    },
    flags.mesh && {
      kind: 'mesh', group: 'models', primary: 'browse', secondary: 'samples', panel: 'mesh',
      formats: formatCodes(MESH_FORMAT_EXTENSIONS), needsModel: false,
    },
    flags.gis && {
      kind: 'map', group: 'context', primary: 'setUpMap', secondary: null, panel: 'map',
      formats: [], needsModel: true,
    },
    {
      kind: 'layers', group: 'context', primary: 'browse', secondary: 'sources', panel: 'layers',
      formats: formatCodes(LAYER_EXTENSIONS), needsModel: false,
    },
    {
      kind: 'devices', group: 'context', primary: 'connect', secondary: null, panel: 'devices',
      formats: ['REST', 'WebSocket', 'MQTT'], needsModel: false,
    },
    {
      kind: 'scene', group: 'scenes', primary: 'browseOne', secondary: null, panel: null,
      formats: [SCENE_FILE_SUFFIX], needsModel: false,
    },
  ]
  return cards.filter((c): c is AddDataCard => c !== false)
}

/** `accept` for a card's picker, or for the hub's catch-all "Choose files…". */
/** Archives the drop path opens in the browser (lib/loading/expand-drop), plus RAR/7z so it can say why not. */
const ARCHIVE_ACCEPT = ['.zip', '.ifczip', '.gz', '.tgz', '.tar', '.rar', '.7z']

export function acceptFor(kind: AddDataKind | 'any', flags: AddDataFlags): string {
  switch (kind) {
    case 'pointcloud': return POINTCLOUD_EXTENSIONS.join(',')
    case 'video': return VIDEO_ACCEPT
    case 'ifc': return [...IFC_EXTENSIONS, ...ARCHIVE_ACCEPT].join(',')
    case 'mesh': return [...MESH_ENTRY_EXTENSIONS, ...MESH_SIDECAR_EXTENSIONS, ...MESH_TEXTURE_EXTENSIONS].join(',')
    case 'layers': return LAYER_FILE_ACCEPT
    case 'scene': return '.json,application/json'
    case 'map':
    case 'devices':
      return ''
    case 'any': {
      const parts: string[] = [...IFC_EXTENSIONS, ...IDS_EXTENSIONS]
      if (flags.pointcloud) parts.push(...POINTCLOUD_EXTENSIONS)
      if (flags.video) parts.push(...VIDEO_FILE_EXTENSIONS)
      if (flags.mesh) parts.push(...MESH_ENTRY_EXTENSIONS, ...MESH_SIDECAR_EXTENSIONS, ...MESH_TEXTURE_EXTENSIONS)
      parts.push(...VECTOR_EXTENSIONS, '.json', ...ARCHIVE_ACCEPT)
      return parts.join(',')
    }
  }
}

export interface DropLegendRow {
  kind: 'ifc' | 'pointcloud' | 'video' | 'mesh' | 'layers' | 'scene'
  formats: string[]
}

/** Rows of the drop overlay: where each dropped format goes. */
export function dropLegend(flags: AddDataFlags): DropLegendRow[] {
  const rows: (DropLegendRow | false)[] = [
    { kind: 'ifc', formats: formatCodes([...IFC_EXTENSIONS, ...IDS_EXTENSIONS]) },
    flags.pointcloud && { kind: 'pointcloud', formats: POINTCLOUD_CODES },
    flags.video && { kind: 'video', formats: formatCodes(VIDEO_FILE_EXTENSIONS) },
    flags.mesh && { kind: 'mesh', formats: formatCodes(MESH_FORMAT_EXTENSIONS) },
    { kind: 'layers', formats: formatCodes(VECTOR_EXTENSIONS) },
    { kind: 'scene', formats: [SCENE_FILE_SUFFIX] },
  ]
  return rows.filter((r): r is DropLegendRow => r !== false)
}
