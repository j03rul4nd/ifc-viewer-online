// ─── Director run — execute a plan: render every shot, assemble, export ───────
// The impure half of the director. For each planned shot it sets the 3D scene
// up (models shown, elements isolated or highlighted), renders the camera move
// at the output size, and puts the scene back. The shots become a Clip Studio
// project — so everything generated stays editable — or, for a batch, one MP4
// per model downloaded straight away.

import { useClipStudioStore } from '../../stores/clipStudioStore'
import { useValidationStore } from '../../stores/validationStore'
import { useSceneStore } from '../../stores/sceneStore'
import { addSource, createProject, makeId, projectDuration, setAllTransitions, type EditProject, type MediaSource } from '../capture/project'
import { renderShot, type ShotRenderer } from '../capture/media-codec'
import { createTextOverlay } from '../capture/timeline'
import { exportProject, type SourceMedia } from '../capture/project-export'
import { getBuiltInBed, type BuiltInBedId } from '../capture/audio-library'
import { BED_RHYTHM } from '../capture/auto-edit'
import { downloadBlob } from '../diffStore'
import type { ValidationIssue } from '../../types'
import type { Recipe } from './recipe'
import type { PlannedClip, ShotScene, Rhythm } from './plan'

/** The viewer calls a run needs on top of shot rendering. */
export interface DirectorViewer extends ShotRenderer {
  getLoadedModelIds(): string[]
  setModelVisible(modelId: string, visible: boolean): void
  isolateElements(targets: Array<{ expressId: number; modelId?: string | null }>, enabled: boolean): void
  setValidationHighlights(issues: ValidationIssue[], enabled: boolean): void
}

export interface RunLabels {
  rendering: (clip: number, clips: number, shot: number, shots: number) => string
  exporting: (clip: number, clips: number) => string
}

export function rhythmForMusic(music: Recipe['music']): Rhythm | null {
  return music === 'none' ? null : { beatSec: BED_RHYTHM[music].beatSec }
}

// ── Scene state ────────────────────────────────────────────────────────────────

function highlightIssues(scene: ShotScene): ValidationIssue[] {
  return (scene.highlight ?? []).flatMap((h, gi) => h.ids.map((expressId) => ({
    id: `director-${gi}-${expressId}`,
    ruleId: 'DIRECTOR_SHOT',
    severity: h.severity,
    expressId,
    globalId: null,
    ifcClass: '',
    elementName: '',
    message: '',
    path: [],
    autoFixable: false,
    modelId: h.modelId,
  }) as ValidationIssue))
}

/** Put the scene in the shot's state. Returns the models it hid, to show them again. */
function applyScene(viewer: DirectorViewer, scene: ShotScene): string[] {
  const hidden: string[] = []
  if (scene.visibleModels) {
    for (const id of viewer.getLoadedModelIds()) {
      if (!scene.visibleModels.includes(id)) { viewer.setModelVisible(id, false); hidden.push(id) }
    }
  }
  const isolate = (scene.isolate ?? []).flatMap((g) => g.ids.map((expressId) => ({ expressId, modelId: g.modelId })))
  if (isolate.length) viewer.isolateElements(isolate, true)
  const issues = highlightIssues(scene)
  if (issues.length) viewer.setValidationHighlights(issues, true)
  return hidden
}

function resetScene(viewer: DirectorViewer, scene: ShotScene, hidden: string[]): void {
  if (scene.highlight?.length) {
    // Hand the overlay back to whatever the validation panel was showing.
    const { validationMode, result } = useValidationStore.getState()
    if (validationMode && result) viewer.setValidationHighlights(result.issues, true)
    else viewer.setValidationHighlights([], false)
  }
  if (scene.isolate?.length || scene.stages?.length) viewer.isolateElements([], false)
  for (const id of hidden) viewer.setModelVisible(id, true)
}

const hasSceneChange = (s: ShotScene) => !!(s.visibleModels || s.isolate?.length || s.highlight?.length || s.stages?.length)

/** How many stages are visible at progress p (0–1): the first from the start, all by 85 %. */
export function stagesAt(p: number, n: number): number {
  if (n <= 0) return 0
  return Math.max(1, Math.min(n, Math.ceil((Math.max(0, p) / 0.85) * n)))
}

/**
 * Per-frame driver for a staged shot: isolates the union of the visible
 * stages, only when the count changes.
 */
function stageDriver(viewer: DirectorViewer, scene: ShotScene, durationSec: number): ((t: number) => void) | undefined {
  const stages = scene.stages
  if (!stages?.length) return undefined
  let shown = -1
  return (t) => {
    const k = stagesAt(durationSec > 0 ? t / durationSec : 1, stages.length)
    if (k === shown) return
    shown = k
    const targets = stages.slice(0, k).flat().flatMap((g) => g.ids.map((expressId) => ({ expressId, modelId: g.modelId })))
    viewer.isolateElements(targets, true)
  }
}

// ── Shot cache ─────────────────────────────────────────────────────────────────
// Changing the captions, the music, the transition or the order re-plans the
// clip but most shots come out identical. A shot is keyed by everything that
// decides its pixels — the move, the scene state, the size, the loaded models
// and where they are, the backdrop — so a re-generate only renders what really
// changed. In memory only, capped, oldest dropped first.

const CACHE_MAX_BYTES = 400 * 1024 * 1024
const shotCache = new Map<string, Blob>()
let cacheBytes = 0

function shotKey(viewer: DirectorViewer & { getModelBounds?: (id?: string) => unknown }, clip: PlannedClip, planned: PlannedClip['shots'][number], fps: number): string {
  const models = viewer.getLoadedModelIds().map((id) => [id, viewer.getModelBounds?.(id)])
  // The validation overlay paints every shot while it is on.
  const overlay = useValidationStore.getState().validationMode
  return JSON.stringify([planned.shot, planned.scene, clip.width, clip.height, fps, models, useSceneStore.getState().background, overlay])
}

function cacheGet(key: string): Blob | undefined {
  const blob = shotCache.get(key)
  if (blob) { shotCache.delete(key); shotCache.set(key, blob) } // most recent last
  return blob
}

function cachePut(key: string, blob: Blob): void {
  shotCache.set(key, blob)
  cacheBytes += blob.size
  for (const [k, b] of shotCache) {
    if (cacheBytes <= CACHE_MAX_BYTES) break
    shotCache.delete(k)
    cacheBytes -= b.size
  }
}

export function clearShotCache(): void {
  shotCache.clear()
  cacheBytes = 0
}

// ── Rendering a plan ───────────────────────────────────────────────────────────

/** Render one planned clip into an editable project + its media. */
export async function renderPlannedClip(
  viewer: DirectorViewer,
  clip: PlannedClip,
  recipe: Recipe,
  fps: number,
  onShot: (i: number, fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ project: EditProject; media: Map<string, SourceMedia>; reused: number }> {
  const media = new Map<string, SourceMedia>()
  let project = createProject()
  let reused = 0
  for (let i = 0; i < clip.shots.length; i++) {
    const planned = clip.shots[i]
    const key = shotKey(viewer, clip, planned, fps)
    let blob = cacheGet(key)
    if (blob) {
      reused++
      onShot(i, 1)
    } else {
      const hidden = applyScene(viewer, planned.scene)
      try {
        const beforeFrame = stageDriver(viewer, planned.scene, planned.shot.durationSec)
        beforeFrame?.(0)
        blob = await renderShot(viewer, planned.shot, {
          width: clip.width, height: clip.height, fps, signal, beforeFrame,
          warmupFrames: hasSceneChange(planned.scene) ? 3 : 1,
          onProgress: (f) => onShot(i, f),
        })
      } finally {
        resetScene(viewer, planned.scene, hidden)
      }
      cachePut(key, blob)
    }
    const source: MediaSource = {
      id: makeId('src'), kind: 'shot', label: planned.label,
      durationSec: planned.shot.durationSec, width: clip.width, height: clip.height,
    }
    media.set(source.id, { kind: 'video', blob })
    project = addSource(project, source)
  }

  project = setAllTransitions(project, clip.transition, Math.max(0.1, clip.transitionSec))
  const total = projectDuration(project)
  project = {
    ...project,
    texts: clip.texts.map((t) => createTextOverlay({
      text: t.text, startSec: t.startSec, endSec: Math.min(total, t.endSec), style: t.style, anchor: t.anchor, anim: t.anim,
    }, total)),
    audio: recipe.music === 'none'
      ? { kind: 'none', trackId: null, fileName: null, volume: 0, fadeSec: 0, offsetSec: 0 }
      : { kind: 'builtin', trackId: recipe.music, fileName: null, volume: recipe.musicVolume, fadeSec: 0.8, offsetSec: 0 },
    intro: recipe.fadeIn ? { type: 'black', sec: 0.5 } : { type: 'none', sec: 0 },
    outro: recipe.fadeOut ? { type: 'black', sec: 0.6 } : { type: 'none', sec: 0 },
  }
  return { project, media, reused }
}

/**
 * Run the whole plan. One clip → it opens in Clip Studio for editing. Several
 * (a batch) → each is exported to MP4 and downloaded as it finishes, and the
 * last one stays open in the studio.
 */
export async function runDirector(
  viewer: DirectorViewer,
  clips: PlannedClip[],
  recipe: Recipe,
  labels: RunLabels,
  signal?: AbortSignal,
): Promise<{ exported: number; reused: number }> {
  const s = useClipStudioStore.getState()
  s.setPreset(recipe.format)
  s.setOutput({ watermark: recipe.watermark, fill: 'crop' })
  const fps = useClipStudioStore.getState().output.fps
  let exported = 0
  let reused = 0
  try {
    for (let c = 0; c < clips.length; c++) {
      const clip = clips[c]
      const n = clip.shots.length
      const { project, media, reused: r } = await renderPlannedClip(viewer, clip, recipe, fps, (i, f) => {
        s.setJob({ label: labels.rendering(c + 1, clips.length, i + 1, n), progress: (i + f) / n })
      }, signal)
      reused += r

      if (clips.length > 1) {
        const label = labels.exporting(c + 1, clips.length)
        s.setJob({ label, progress: 0 })
        const bed = recipe.music === 'none' ? null : await getBuiltInBed(recipe.music as BuiltInBedId, 48_000)
        const out = useClipStudioStore.getState().output
        const result = await exportProject(project, media, {
          width: out.width, height: out.height, fps: out.fps, fill: out.fill, watermark: out.watermark, bed, signal,
          onProgress: (f) => s.setJob({ label, progress: f }),
        })
        const ext = result.choice.container
        await downloadBlob(result.blob, `${slug(clip.title) || 'presentation'}-${recipe.format}.${ext}`)
        exported++
      }
      if (c === clips.length - 1) s.replaceProject(project, media)
    }
  } finally {
    s.setJob(null)
  }
  return { exported, reused }
}

function slug(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
}
