// ─── Drop plan ────────────────────────────────────────────────────────────────
// classifyFiles answers "which subsystem owns each file?". This module answers
// the next two questions, still without touching a byte or a store:
//
//   1. What will actually be loaded, given what this viewer can load right now
//      (flags, client mode, embeds)? Everything else is `unsupported` — or, for
//      scanner formats we recognise, `deferred` with specific advice.
//   2. What should the user see afterwards? (`followUp`: open the one panel the
//      drop was about, or a single "Adding to the scene: …" toast with Show.)
//
// App's drop handler and the Add data hub both go through here, so a dropped
// file and a picked file behave the same. See docs/ADD_DATA.md.

import { classifyFiles, fileExtensionOf, groupMeshFiles } from './drop-routing'
import { DEFERRED_EXTENSIONS } from '../pointcloud/pc-types'

/** What the viewer can load right now. */
export interface DropCaps {
  pointcloud: boolean
  mesh: boolean
  video: boolean
  /** Scene documents (off inside embeds: a host owns that page). */
  scene: boolean
  /** Weather files for the solar analysis (off where its panel cannot mount). Default off. */
  weather?: boolean
}

export type DeferredReasonKey = 'unsupported.e57' | 'unsupported.proprietary'

export interface DropPlan {
  ifc: File[]
  ids: File | null
  /** Further .ids files of the same drop: kept in the IDS library, not discarded. */
  moreIds: File[]
  /**
   * Project documents that travel with the models — PDFs, office files,
   * images, notes, CAD exports. Nothing renders them in 3D; they are kept with
   * the scene (documentStore) so the set arrives whole.
   */
  documents: File[]
  bcf: File[]
  pointcloud: File[]
  /** Entry files, sidecars and textures — one selection for the mesh loader. */
  mesh: File[]
  video: File[]
  vector: File[]
  /** Weather files (`.epw`, a weather-named zip) for the solar analysis panel. */
  weather: File[]
  scene: File | null
  /** Recognised but not decoded; one group per reason key, in arrival order. */
  deferred: { reasonKey: DeferredReasonKey; files: File[] }[]
  /** Nothing opens these: unknown files, flag-off kinds, extra IDS/scene files, sidecar-only mesh picks. */
  unsupported: File[]
}

/** The data kinds a drop can hand to a panel, in follow-up priority order. */
export type FollowUpKind = 'pointcloud' | 'mesh' | 'video' | 'layers'

/**
 * Files kept as project documents. Text and CSV only land here when
 * classifyFiles already decided they are not a point list (next to an IFC).
 */
export const DOCUMENT_EXTENSIONS: ReadonlySet<string> = new Set([
  '.pdf', '.doc', '.docx', '.odt', '.rtf', '.md', '.txt', '.csv',
  '.xls', '.xlsx', '.ods', '.ppt', '.pptx', '.odp',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.tif', '.tiff', '.heic',
  '.dwg', '.dxf', '.rvt', '.rfa', '.nwd', '.nwc', '.skp', '.3dm', '.pln',
  '.xml', '.json', '.yaml', '.yml', '.ini', '.cfg', '.html', '.htm', '.eml', '.msg',
])

export function planDrop(files: readonly File[], caps: DropCaps): DropPlan {
  const r = classifyFiles(files)
  const documents = r.other.filter((f) => DOCUMENT_EXTENSIONS.has(fileExtensionOf(f.name)))
  const unsupported: File[] = r.other.filter((f) => !DOCUMENT_EXTENSIONS.has(fileExtensionOf(f.name)))

  const ids = r.ids[0] ?? null
  const moreIds = r.ids.slice(1)

  let scene: File | null = null
  if (caps.scene) {
    scene = r.scene[0] ?? null
    unsupported.push(...r.scene.slice(1))
  } else {
    unsupported.push(...r.scene)
  }

  const pointcloud = caps.pointcloud ? r.pointcloud : []
  if (!caps.pointcloud) unsupported.push(...r.pointcloud)

  let mesh: File[] = []
  if (caps.mesh && groupMeshFiles(r.mesh).length > 0) mesh = r.mesh
  else unsupported.push(...r.mesh)

  const video = caps.video ? r.video : []
  if (!caps.video) unsupported.push(...r.video)

  const weather = caps.weather ? r.weather : []
  if (!caps.weather) unsupported.push(...r.weather)

  const deferred: DropPlan['deferred'] = []
  for (const file of r.deferred) {
    const reasonKey = (DEFERRED_EXTENSIONS[fileExtensionOf(file.name)] ?? 'unsupported.proprietary') as DeferredReasonKey
    const group = deferred.find((g) => g.reasonKey === reasonKey)
    if (group) group.files.push(file)
    else deferred.push({ reasonKey, files: [file] })
  }

  return { ifc: r.ifc, ids, moreIds, documents, bcf: r.bcf, pointcloud, mesh, video, vector: r.vector, weather, scene, deferred, unsupported }
}

/** Number of files some subsystem will open (mesh counts its entry files). */
export function plannedCount(plan: DropPlan): number {
  return plan.ifc.length + (plan.ids ? 1 : 0) + plan.moreIds.length + plan.documents.length + plan.bcf.length + plan.pointcloud.length
    + groupMeshFiles(plan.mesh).length + plan.video.length + plan.vector.length + plan.weather.length + (plan.scene ? 1 : 0)
}

/**
 * Scans, meshes and videos wait for the IFC review when the drop carries an
 * IFC or the upload dialog is already open: the first IFC sets the coordinate
 * base they are placed against.
 */
export function holdsForReview(plan: DropPlan, uploadOpen: boolean): boolean {
  return (plan.ifc.length > 0 || uploadOpen)
    && plan.pointcloud.length + plan.mesh.length + plan.video.length > 0
}

/** Files per kind as the user would name them (mesh: entry files only). */
function filesOf(plan: DropPlan, kind: FollowUpKind): File[] {
  switch (kind) {
    case 'pointcloud': return plan.pointcloud
    case 'mesh': return groupMeshFiles(plan.mesh).map((g) => g.entry)
    case 'video': return plan.video
    case 'layers': return plan.vector
  }
}

const FOLLOW_UP_ORDER: readonly FollowUpKind[] = ['pointcloud', 'mesh', 'video', 'layers']

export interface FollowUp {
  /** Panel to open right away. */
  open: FollowUpKind | null
  /** Files to name in one "Adding to the scene: …" toast (empty → no toast). */
  summary: File[]
  /** Panel the toast's Show action opens. */
  show: FollowUpKind | null
}

/**
 * What to show after a drop that was not held for the IFC review.
 * - Not interactive (client mode, quiet presets, compact or no toolbar): nothing.
 * - Exactly one kind: open its panel.
 * - Several kinds: data layers must open (the panel mounts to drain its queue)
 *   and the rest get a toast whose Show opens the first non-layers kind;
 *   without layers, a toast whose Show opens the first kind.
 */
export function followUp(plan: DropPlan, opts: { interactive: boolean }): FollowUp {
  const none: FollowUp = { open: null, summary: [], show: null }
  if (!opts.interactive) return none
  const kinds = FOLLOW_UP_ORDER.filter((k) => filesOf(plan, k).length > 0)
  if (kinds.length === 0) return none
  if (kinds.length === 1) return { open: kinds[0], summary: [], show: null }
  if (kinds.includes('layers')) {
    const rest = kinds.filter((k) => k !== 'layers')
    return { open: 'layers', summary: rest.flatMap((k) => filesOf(plan, k)), show: rest[0] ?? null }
  }
  return { open: null, summary: kinds.flatMap((k) => filesOf(plan, k)), show: kinds[0] }
}

/** First `max` names joined with ', ', plus how many were left out. */
export function listNames(files: readonly File[], max = 3): { names: string; more: number } {
  return {
    names: files.slice(0, max).map((f) => f.name).join(', '),
    more: Math.max(0, files.length - max),
  }
}
