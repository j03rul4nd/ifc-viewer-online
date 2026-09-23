// ─── Scene facts — what the loaded models really contain ──────────────────────
// Reads the stores and asks the viewer for boxes, so the planner can stay pure.
// Everything here is observed, nothing invented: storeys come from the IFC
// spatial tree, systems from the element classes, findings from the last
// validation run, stops from the tour the user recorded or generated.

import { useModelStore } from '../../stores/modelStore'
import { useValidationStore } from '../../stores/validationStore'
import { usePresentationStore } from '../../stores/presentationStore'
import { useEditorStore } from '../../stores/editorStore'
import { groupIssuesForTour } from '../tour/generateAutoTour'
import { getRuleLabel, type SpatialNode } from '../../types'
import { DEFAULT_FOV_DEG } from '../capture/shots'
import { groupSystems, type SystemKey } from './systems'
import type { Box, ModelFacts, SceneFacts, Subject, TourStop } from './plan'

/** The viewer calls the gatherer needs. */
export interface FactsViewer {
  getLoadedModelIds(): string[]
  getModelBounds(modelId?: string): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  getElementsBox(ids: number[], modelId?: string): Promise<Box | null>
  getStoreys(modelId?: string): Promise<Array<{ expressId: number; name: string; elementIds: number[] }>>
  getProjectNames(modelId?: string): Promise<{ project: string | null; building: string | null }>
}

export interface FactsOptions {
  lang: string
  systemLabel: (key: SystemKey) => string
  /** Limits keep the number of box queries small on huge models. */
  maxStoreys?: number
  maxIssues?: number
  /** Skip hidden models (the user hid them for a reason). */
  onlyModels?: string[]
}

export async function gatherSceneFacts(viewer: FactsViewer, o: FactsOptions): Promise<SceneFacts> {
  const { models: entries } = useModelStore.getState()
  const validation = useValidationStore.getState()
  const loaded = viewer.getLoadedModelIds().filter((id) => !o.onlyModels || o.onlyModels.includes(id))

  const models: ModelFacts[] = []
  for (const modelId of loaded) {
    const bounds = viewer.getModelBounds(modelId)
    if (!bounds) continue
    const info = entries[modelId]?.modelInfo
    const result = validation.cachedResultsByModel[modelId]
      ?? (validation.activeValidationModelId === modelId ? validation.result : null)

    // Storeys, bottom to top — each with the elements it contains. The model's
    // own spatial structure first; the validator's tree when that is empty.
    let found = await viewer.getStoreys(modelId)
    if (found.length === 0) {
      found = findStoreys(validation.spatialTrees[modelId] ?? []).map((n) => ({
        expressId: n.expressId, name: n.name || n.longName || `#${n.expressId}`, elementIds: collectElements(n),
      }))
    }
    const storeys: Subject[] = []
    for (const st of found) {
      if (st.elementIds.length === 0) continue
      const box = await viewer.getElementsBox(st.elementIds, modelId)
      if (!box) continue
      storeys.push({ key: `storey:${st.expressId}`, label: st.name, count: st.elementIds.length, modelId, ids: st.elementIds, box })
      if (storeys.length >= (o.maxStoreys ?? 30)) break
    }
    storeys.sort((a, b) => a.box.min.y - b.box.min.y)

    const systems: Subject[] = []
    for (const g of groupSystems(info?.categories ?? [])) {
      const box = await viewer.getElementsBox(g.ids, modelId)
      if (box) systems.push({ key: g.key, label: o.systemLabel(g.key), count: g.ids.length, modelId, ids: g.ids, box })
    }

    const issues: Subject[] = []
    if (result) {
      for (const g of groupIssuesForTour(result.issues.filter((i) => !i.modelId || i.modelId === modelId), { maxSteps: o.maxIssues ?? 8 })) {
        if (g.expressIds.length === 0) continue // file-level finding: nothing to film
        const box = await viewer.getElementsBox(g.expressIds, modelId)
        if (box) issues.push({ key: `issue:${g.ruleId}`, label: getRuleLabel(g.ruleId, o.lang), count: g.count, modelId, ids: g.expressIds, box, severity: g.severity })
      }
    }

    models.push({
      modelId,
      name: presentableName(await viewer.getProjectNames(modelId), info?.fileName ?? modelId),
      bounds,
      elementCount: info?.elementCount ?? 0,
      score: typeof result?.qualityScore === 'number' ? result.qualityScore : null,
      storeys, systems, issues,
    })
  }

  return { models, tour: tourStops(), detail: await selectedSubject(viewer) }
}

/** The current tour, as camera stops. */
export function tourStops(): TourStop[] {
  const tour = usePresentationStore.getState().tour
  if (!tour) return []
  return tour.steps.map((s) => ({
    pose: { position: s.camera.position, target: s.camera.target, fovDeg: DEFAULT_FOV_DEG },
    aspect: s.aspect,
    caption: s.caption,
    highlight: s.highlightedExpressIds?.length
      ? { modelId: s.modelId, ids: s.highlightedExpressIds, severity: s.issueSeverity }
      : undefined,
  }))
}

async function selectedSubject(viewer: FactsViewer): Promise<Subject | null> {
  const sel = useEditorStore.getState().selection[0]
  if (!sel) return null
  const box = await viewer.getElementsBox([sel.expressId], sel.modelId)
  if (!box) return null
  return { key: `el:${sel.expressId}`, label: `#${sel.expressId}`, count: 1, modelId: sel.modelId ?? '', ids: [sel.expressId], box }
}

export function findStoreys(nodes: readonly SpatialNode[]): SpatialNode[] {
  const out: SpatialNode[] = []
  const walk = (n: SpatialNode) => {
    if (/^ifcbuildingstorey$/i.test(n.ifcClass)) { out.push(n); return }
    n.children.forEach(walk)
  }
  nodes.forEach(walk)
  return out
}

/** Every element contained in a node or its sub-nodes (spaces, zones). */
export function collectElements(node: SpatialNode): number[] {
  const ids = new Set<number>()
  const walk = (n: SpatialNode) => {
    for (const e of n.containedElements) ids.add(e.expressId)
    n.children.forEach(walk)
  }
  walk(node)
  return [...ids]
}

/**
 * What to call a model on screen: the name its authors gave the project or
 * building, unless that is a placeholder ("Project", "Default", "0001"…);
 * otherwise the file name, tidied.
 */
export function presentableName(names: { project: string | null; building: string | null }, fileName: string): string {
  for (const n of [names.project, names.building]) {
    if (n && !isPlaceholderName(n)) return shortTitle(n)
  }
  return prettyName(fileName)
}

/** A title that fits on screen: long descriptive names are cut at their first clause. */
export function shortTitle(n: string): string {
  const s = n.trim().replace(/\s+/g, ' ')
  if (s.length <= 40) return s
  const cut = s.split(/\s[-–—|:]\s|,\s/)[0]
  return cut.length >= 3 && cut.length <= 48 ? cut : `${s.slice(0, 38).trimEnd()}…`
}

export function isPlaceholderName(n: string): boolean {
  const s = n.trim()
  return s.length < 3
    || /^[\d\s._-]+$/.test(s)
    || /^(project|projekt|proyecto|projet|progetto|default|unnamed|untitled|sin nombre|building|edificio|gebäude|bâtiment|site|model|ifc ?project|new project|nuevo proyecto|#\d+)$/i.test(s)
}

export function prettyName(fileName: string): string {
  return fileName.replace(/\.(ifc|ifczip|ifcxml|frag)$/i, '').replace(/[_-]+/g, ' ').trim()
}
