// ─── Clip Studio actions — the glue between UI, viewer and engine ──────────────
// Everything that takes time or touches the 3D scene lives here, so the React
// components stay about layout and input. Each action reports progress through
// the store's `job` and is cancellable with an AbortSignal.

import { useClipStudioStore } from '../../stores/clipStudioStore'
import { useModelStore } from '../../stores/modelStore'
import { useValidationStore } from '../../stores/validationStore'
import { useEditorStore } from '../../stores/editorStore'
import { linkedViewer } from './viewer-link'
import {
  addSource, createProject, makeId, projectDuration, setAllTransitions,
  type EditProject, type MediaSource,
} from './project'
import { defaultShot, type ShotType } from './shots'
import { renderShot, openVideoReader } from './media-codec'
import { planAutoEdit, PLATFORM_SPECS, BED_RHYTHM, type ModelFacts, type Platform } from './auto-edit'
import { createTextOverlay } from './timeline'
import { exportProject, type SourceMedia } from './project-export'
import { getBuiltInBed } from './audio-library'

/** What the model can honestly say about itself — nothing invented. */
export function currentModelFacts(): ModelFacts {
  const info = useModelStore.getState().modelInfo
  const score = useValidationStore.getState().result?.qualityScore
  const name = (info?.fileName ?? '').replace(/\.(ifc|ifczip|ifcxml|frag)$/i, '').replace(/[_-]+/g, ' ').trim()
  return {
    name,
    elementCount: info?.elementCount || undefined,
    healthScore: typeof score === 'number' ? score : undefined,
  }
}

export function canRenderShots(): boolean {
  const v = linkedViewer()
  return !!v && !!v.getModelBounds()
}

// ── Media probing ──────────────────────────────────────────────────────────────

export async function probeFile(file: File): Promise<{ source: MediaSource; media: SourceMedia }> {
  const id = makeId('src')
  if (file.type.startsWith('image/')) {
    const image = await createImageBitmap(file)
    return {
      source: { id, kind: 'image', label: file.name, durationSec: 3, width: image.width, height: image.height },
      media: { kind: 'image', image, width: image.width, height: image.height },
    }
  }
  const reader = await openVideoReader(file)
  try {
    return {
      source: { id, kind: 'import', label: file.name, durationSec: reader.durationSec, width: reader.width, height: reader.height },
      media: { kind: 'video', blob: file },
    }
  } finally {
    reader.dispose()
  }
}

/** Add a screen capture (the replay buffer's clip) as a source + clip. */
export async function addCaptureBlob(blob: Blob, label: string): Promise<void> {
  const reader = await openVideoReader(blob)
  const source: MediaSource = {
    id: makeId('src'), kind: 'capture', label, durationSec: reader.durationSec, width: reader.width, height: reader.height,
  }
  reader.dispose()
  const s = useClipStudioStore.getState()
  s.addMedia(source.id, { kind: 'video', blob })
  s.edit((p) => addSource(p, source))
}

export async function addFiles(files: FileList | File[]): Promise<void> {
  const s = useClipStudioStore.getState()
  for (const file of Array.from(files)) {
    const { source, media } = await probeFile(file)
    s.addMedia(source.id, media)
    s.edit((p) => addSource(p, source))
  }
}

// ── Shots ──────────────────────────────────────────────────────────────────────

async function renderShotSource(
  type: ShotType, durationSec: number, width: number, height: number, fps: number,
  label: string, signal?: AbortSignal, onProgress?: (f: number) => void,
  over?: Partial<ReturnType<typeof defaultShot>>,
): Promise<{ source: MediaSource; media: SourceMedia }> {
  const viewer = linkedViewer()
  const bounds = viewer?.getModelBounds()
  if (!viewer || !bounds) throw new Error('Open a model first — shots are rendered from the 3D scene')
  const shot = { ...defaultShot(type, bounds, width / height, durationSec), ...over }
  const blob = await renderShot(viewer, shot, { width, height, fps, signal, onProgress })
  const source: MediaSource = { id: makeId('src'), kind: 'shot', label, durationSec, width, height }
  return { source, media: { kind: 'video', blob } }
}

/** Render one camera move from the model and append it to the timeline. */
export async function addShot(type: ShotType, label: string, durationSec = 4, signal?: AbortSignal): Promise<void> {
  const s = useClipStudioStore.getState()
  const { width, height, fps } = s.output
  s.setJob({ label, progress: 0 })
  try {
    const { source, media } = await renderShotSource(type, durationSec, width, height, fps, label, signal, (f) => s.setJob({ label, progress: f }))
    s.addMedia(source.id, media)
    s.edit((p) => addSource(p, source))
  } finally {
    s.setJob(null)
  }
}

/** The element selected in the viewer, if any — what a focus shot frames. */
export function selectedElement(): { expressId: number; modelId?: string } | null {
  return useEditorStore.getState().selection[0] ?? null
}

/**
 * A slow arc around the selected element, framed from ITS box (with room for
 * context) — the "look at this detail" shot: a clash, a connection, a door.
 */
export async function addFocusShot(label: string, durationSec = 4, signal?: AbortSignal): Promise<void> {
  const viewer = linkedViewer()
  const sel = selectedElement()
  if (!viewer || !sel) throw new Error('Select an element in the viewer first')
  const box = await viewer.getElementsBox([sel.expressId], sel.modelId)
  if (!box) throw new Error('The selected element has no geometry to frame')
  const bounds = {
    center: { x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, z: (box.min.z + box.max.z) / 2 },
    // A tiny element still gets a readable frame — never tighter than half a metre.
    size: {
      x: Math.max(0.5, box.max.x - box.min.x),
      y: Math.max(0.5, box.max.y - box.min.y),
      z: Math.max(0.5, box.max.z - box.min.z),
    },
  }
  const s = useClipStudioStore.getState()
  const { width, height, fps } = s.output
  s.setJob({ label, progress: 0 })
  try {
    const shot = { ...defaultShot('focus', bounds, width / height, durationSec) }
    const blob = await renderShot(viewer, shot, { width, height, fps, signal, onProgress: (f) => s.setJob({ label, progress: f }) })
    const source: MediaSource = { id: makeId('src'), kind: 'shot', label, durationSec, width, height }
    s.addMedia(source.id, { kind: 'video', blob })
    s.edit((p) => addSource(p, source))
  } finally {
    s.setJob(null)
  }
}

// ── Auto clip ──────────────────────────────────────────────────────────────────

export interface AutoClipLabels {
  rendering: (i: number, n: number) => string
  shot: (type: ShotType) => string
}

/**
 * Plan, render every shot, and assemble a finished project for `platform`:
 * shots on the beat, the platform's transition, captions from the model's
 * facts, the matching music bed and a fade out. Replaces the current project
 * (undoable).
 */
export async function autoClip(platform: Platform, lang: string, labels: AutoClipLabels, signal?: AbortSignal): Promise<void> {
  const viewer = linkedViewer()
  const bounds = viewer?.getModelBounds()
  if (!viewer || !bounds) throw new Error('Open a model first — shots are rendered from the 3D scene')
  const s = useClipStudioStore.getState()
  s.setPreset(platform)
  const spec = PLATFORM_SPECS[platform]
  const plan = planAutoEdit(platform, bounds, currentModelFacts(), lang)

  const media = new Map(s.media)
  let project: EditProject = createProject()
  try {
    for (let i = 0; i < plan.shots.length; i++) {
      const shot = plan.shots[i]
      const label = labels.rendering(i + 1, plan.shots.length)
      s.setJob({ label, progress: i / plan.shots.length })
      const blob = await renderShot(viewer, shot, {
        width: spec.width, height: spec.height, fps: spec.fps, signal,
        onProgress: (f) => s.setJob({ label, progress: (i + f) / plan.shots.length }),
      })
      const source: MediaSource = {
        id: makeId('src'), kind: 'shot', label: labels.shot(shot.type),
        durationSec: shot.durationSec, width: spec.width, height: spec.height,
      }
      media.set(source.id, { kind: 'video', blob })
      project = addSource(project, source)
    }
  } finally {
    s.setJob(null)
  }

  project = setAllTransitions(project, spec.transition, spec.transitionSec)
  const total = projectDuration(project)
  project = {
    ...project,
    texts: plan.texts.map((t) => createTextOverlay({ text: t.text, startSec: t.startSec, endSec: t.endSec, style: t.style, anchor: t.anchor, anim: 'pop' }, total)),
    audio: { kind: 'builtin', trackId: spec.bed, fileName: null, volume: 0.7, fadeSec: 0.6, offsetSec: 0 },
    outro: { type: 'black', sec: 0.5 },
  }
  s.replaceProject(project, media)
}

export function rhythmFor(project: EditProject) {
  if (project.audio.kind === 'builtin' && project.audio.trackId && project.audio.trackId in BED_RHYTHM) {
    return BED_RHYTHM[project.audio.trackId as keyof typeof BED_RHYTHM]
  }
  return null
}

// ── Export ─────────────────────────────────────────────────────────────────────

export async function exportStudio(signal?: AbortSignal, label = 'Exporting'): Promise<Blob> {
  const s = useClipStudioStore.getState()
  const { project, media, output } = s
  let bed: AudioBuffer | null = null
  if (project.audio.kind === 'builtin' && project.audio.trackId) {
    bed = await getBuiltInBed(project.audio.trackId as Parameters<typeof getBuiltInBed>[0], 48_000)
  }
  // The studio offers built-in beds only; a user track is not mixed yet.
  s.setJob({ label, progress: 0 })
  try {
    const result = await exportProject(project, media, {
      width: output.width, height: output.height, fps: output.fps, fill: output.fill, watermark: output.watermark,
      bed, signal,
      onProgress: (f) => s.setJob({ label, progress: f }),
    })
    return result.blob
  } finally {
    s.setJob(null)
  }
}
