// ─── Scene facts — what the loaded models really contain ──────────────────────
// Reads the stores and asks the viewer for boxes, so the planner can stay pure.
// Everything here is observed, nothing invented: storeys come from the IFC
// spatial tree, systems from the element classes, findings from the last
// validation run (and the one before, for what was fixed), failed IDS
// specifications, BCF topics with their viewpoints, and the recorded tour.

import { useModelStore } from '../../stores/modelStore'
import { useValidationStore } from '../../stores/validationStore'
import { usePresentationStore } from '../../stores/presentationStore'
import { useEditorStore } from '../../stores/editorStore'
import { useIdsStore } from '../../stores/idsStore'
import { useBcfStore } from '../../stores/bcfStore'
import { getRuleRemediation } from '../../i18n/rule-remediation'
import { groupIssuesForTour } from '../tour/generateAutoTour'
import { getRuleLabel, type BcfTopic, type SpatialNode, type ValidationIssue } from '../../types'
import { DEFAULT_FOV_DEG, type CameraPose } from '../capture/shots'
import { groupSystems, type SystemKey } from './systems'
import type { Box, ModelFacts, SceneFacts, Subject, TourStop } from './plan'

/** The viewer calls the gatherer needs. */
export interface FactsViewer {
  getLoadedModelIds(): string[]
  getModelBounds(modelId?: string): { center: { x: number; y: number; z: number }; size: { x: number; y: number; z: number } } | null
  getElementsBox(ids: number[], modelId?: string): Promise<Box | null>
  getStoreys(modelId?: string): Promise<Array<{ expressId: number; name: string; elementIds: number[] }>>
  getProjectNames(modelId?: string): Promise<{ project: string | null; building: string | null }>
  getIdsByGuids(guids: string[], modelId?: string): Promise<(number | null)[]>
}

/** Localised bits of the review detail lines (the UI supplies them from i18n). */
export interface ReviewWords {
  more: (n: number) => string
  howToFix: string
  unassigned: string
}

export interface FactsOptions {
  lang: string
  systemLabel: (key: SystemKey) => string
  /** Limits keep the number of box queries small on huge models. */
  maxStoreys?: number
  maxIssues?: number
  /** Skip hidden models (the user hid them for a reason). */
  onlyModels?: string[]
  /** Wording for review details. */
  review?: ReviewWords
}

/** Cap on elements highlighted per subject — the overlay stays fast. */
const MAX_IDS = 200

export async function gatherSceneFacts(viewer: FactsViewer, o: FactsOptions): Promise<SceneFacts> {
  const { models: entries } = useModelStore.getState()
  const validation = useValidationStore.getState()
  const loaded = viewer.getLoadedModelIds().filter((id) => !o.onlyModels || o.onlyModels.includes(id))

  const models: ModelFacts[] = []
  for (const modelId of loaded) {
    const bounds = viewer.getModelBounds(modelId)
    if (!bounds) continue
    const info = entries[modelId]?.modelInfo
    const names = await viewer.getProjectNames(modelId)
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

    const own = (list: readonly ValidationIssue[]) => list.filter((i) => !i.modelId || i.modelId === modelId)
    const issues: Subject[] = []
    if (result) {
      const all = own(result.issues)
      for (const g of groupIssuesForTour(all, { maxSteps: o.maxIssues ?? 8 })) {
        if (g.expressIds.length === 0) continue // file-level finding: nothing to film
        const box = await viewer.getElementsBox(g.expressIds, modelId)
        if (box) issues.push({
          key: `issue:${g.ruleId}`, label: getRuleLabel(g.ruleId, o.lang), count: g.count, modelId, ids: g.expressIds, box,
          severity: g.severity, detail: issueDetail(all.filter((i) => i.ruleId === g.ruleId), g.ruleId, o),
        })
      }
    }

    // What the previous run flagged and this one does not: the fixes.
    const before = validation.previousResultByModel[modelId] ?? null
    const fixed: Subject[] = []
    if (before && result) {
      const now = new Set(own(result.issues).map(issueKey))
      const gone = own(before.issues).filter((i) => !now.has(issueKey(i)) && (i.globalId || i.expressId > 0))
      for (const [ruleId, list] of groupBy(gone, (i) => i.ruleId)) {
        const ids = (await resolveIds(viewer, modelId, list)).slice(0, MAX_IDS)
        const box = ids.length ? await viewer.getElementsBox(ids, modelId) : null
        if (box) fixed.push({ key: `fixed:${ruleId}`, label: getRuleLabel(ruleId, o.lang), count: list.length, modelId, ids, box, detail: elementLines(list, o) })
      }
      fixed.sort((a, b) => b.count - a.count)
    }

    // Failed IDS specifications, the failing elements highlighted.
    const idsFacts: Subject[] = []
    for (const spec of useIdsStore.getState().resultsByModel[modelId]?.specs ?? []) {
      if (spec.status !== 'fail' || spec.failures.length === 0) continue
      const ids = spec.failures.map((f) => f.expressId).filter((id) => id > 0).slice(0, MAX_IDS)
      const box = ids.length ? await viewer.getElementsBox(ids, modelId) : null
      if (!box) continue
      idsFacts.push({
        key: `ids:${spec.name}`, label: spec.name, count: spec.failedCount, modelId, ids, box, severity: 'error',
        detail: [
          ...(spec.description ? [clip(spec.description, 90)] : []),
          ...elementLines(spec.failures.map((f) => ({ ifcClass: f.ifcClass, elementName: f.name })), o),
        ],
      })
      if (idsFacts.length >= (o.maxIssues ?? 8)) break
    }

    models.push({
      modelId,
      name: presentableName(names, info?.fileName ?? modelId),
      bounds,
      elementCount: info?.elementCount ?? 0,
      score: typeof result?.qualityScore === 'number' ? result.qualityScore : null,
      storeys, systems, issues,
      // The project a discipline model belongs to groups it with its siblings.
      group: groupKey(names),
      ids: idsFacts,
      fixed,
      scoreBefore: typeof before?.qualityScore === 'number' ? before.qualityScore : null,
      bcf: [],
    })
  }

  await attachBcf(viewer, models, o)
  return { models, tour: tourStops(), detail: await selectedSubject(viewer) }
}

/**
 * Which project a model belongs to. Discipline files of one job usually share
 * the BUILDING name ("Poblenou Pavilion") while each project name carries its
 * discipline ("Poblenou Pavilion - Architecture"), so the building decides;
 * failing that, the project name without its " - discipline" tail.
 */
export function groupKey(names: { project: string | null; building: string | null }): string | undefined {
  if (names.building && !isPlaceholderName(names.building)) return shortTitle(names.building)
  if (names.project && !isPlaceholderName(names.project)) return shortTitle(names.project.split(/\s[-–—|:]\s/)[0])
  return undefined
}

// ── Review details ─────────────────────────────────────────────────────────────

function issueKey(i: ValidationIssue): string {
  return `${i.ruleId}::${i.globalId ?? `e${i.expressId}`}`
}

function groupBy<T>(list: readonly T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const t of list) {
    const k = key(t)
    const arr = m.get(k)
    if (arr) arr.push(t)
    else m.set(k, [t])
  }
  return m
}

export function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t
}

/** "IfcWall · Basic Wall 200", up to three, then "+N more". */
export function elementLines(list: readonly { ifcClass: string; elementName: string }[], o: Pick<FactsOptions, 'review'>): string[] {
  const shown = list.slice(0, 3).map((e) => clip([e.ifcClass, e.elementName].filter(Boolean).join(' · '), 60)).filter(Boolean)
  const rest = list.length - shown.length
  return rest > 0 && o.review ? [...shown, o.review.more(rest)] : shown
}

function issueDetail(list: readonly ValidationIssue[], ruleId: string, o: FactsOptions): string[] {
  const fix = getRuleRemediation(ruleId, o.lang)?.summary
  return [...elementLines(list, o), ...(fix && o.review ? [`${o.review.howToFix}: ${clip(fix, 110)}`] : [])]
}

/** Elements of a past run, found again in the current model by GlobalId. */
async function resolveIds(viewer: FactsViewer, modelId: string, list: readonly ValidationIssue[]): Promise<number[]> {
  const guids = list.map((i) => i.globalId).filter((g): g is string => !!g)
  const found = guids.length ? (await viewer.getIdsByGuids(guids, modelId)).filter((id): id is number => id !== null) : []
  const byId = list.filter((i) => !i.globalId && i.expressId > 0).map((i) => i.expressId)
  return [...new Set([...found, ...byId])]
}

/**
 * BCF topics with something to film: their components (by GlobalId, in
 * whichever loaded model has most of them) and their camera. A topic with
 * neither is skipped — there is nothing to point the camera at.
 */
async function attachBcf(viewer: FactsViewer, models: ModelFacts[], o: FactsOptions): Promise<void> {
  if (models.length === 0) return
  const topics: BcfTopic[] = useBcfStore.getState().topics
  for (const topic of topics.slice(0, 30)) {
    const vp = topic.viewpoints[0]
    const guids = vp?.componentGuids ?? []
    let best: { m: ModelFacts; ids: number[] } | null = null
    for (const m of guids.length ? models : []) {
      const ids = (await viewer.getIdsByGuids(guids, m.modelId)).filter((id): id is number => id !== null)
      if (ids.length && (!best || ids.length > best.ids.length)) best = { m, ids }
    }
    const box = best ? await viewer.getElementsBox(best.ids, best.m.modelId) : null
    const pose = viewpointPose(vp?.cameraPosition, vp?.cameraDirection, vp?.fieldOfView, box)
    // No components: the topic belongs to the model the camera is looking at.
    const owner = best?.m ?? (pose ? nearestModel(models, pose.target) : models[0])
    const area = box ?? (pose ? { min: pose.target, max: pose.target } : null)
    if (!area) continue
    owner.bcf = [...(owner.bcf ?? []), {
      key: `bcf:${topic.guid}`, label: clip(topic.title || '—', 70), count: best?.ids.length ?? 0, modelId: owner.modelId,
      ids: best?.ids ?? [], box: area, pose,
      severity: /high|critical|major|alta|crít|urgent/i.test(topic.priority ?? '') ? 'error' : 'warning',
      detail: [
        [topic.status, topic.priority, topic.assignedTo ?? o.review?.unassigned].filter(Boolean).join(' · '),
        ...(topic.description ? [clip(topic.description, 110)] : []),
      ].filter(Boolean),
    }]
  }
}

type V3 = { x: number; y: number; z: number }

/** The model whose box contains the point, else the one whose centre is closest. */
export function nearestModel(models: ModelFacts[], p: V3): ModelFacts {
  let best = models[0]
  let bestD = Infinity
  for (const m of models) {
    const { center: c, size: s } = m.bounds
    const inside = Math.abs(p.x - c.x) <= s.x / 2 && Math.abs(p.y - c.y) <= s.y / 2 && Math.abs(p.z - c.z) <= s.z / 2
    const d = inside ? -1 : Math.hypot(p.x - c.x, p.y - c.y, p.z - c.z)
    if (d < bestD) { bestD = d; best = m }
  }
  return best
}

/** A BCF camera as a pose: looking along its direction, at the components when there are some. */
export function viewpointPose(pos: V3 | undefined, dir: V3 | undefined, fov: number | undefined, box: Box | null): CameraPose | undefined {
  if (!pos || !dir) return undefined
  const len = Math.hypot(dir.x, dir.y, dir.z) || 1
  const c = box ? { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 } : null
  const d = c ? Math.max(1, Math.hypot(c.x - pos.x, c.y - pos.y, c.z - pos.z)) : 10
  return {
    position: pos,
    target: { x: pos.x + (dir.x / len) * d, y: pos.y + (dir.y / len) * d, z: pos.z + (dir.z / len) * d },
    fovDeg: fov && fov > 5 && fov < 120 ? fov : DEFAULT_FOV_DEG,
  }
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
