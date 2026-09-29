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
import { decodeUserAudio, getBuiltInBed } from './audio-library'
import { sliceBuffer, soundStart } from './sound-capture'
import type { SoundLink } from './tiktok-link'
import { cutForSound, finishSoundClip, rememberSound } from './sound-clip'
import type { TemplateContext, TemplateId } from './viral-templates'
import type { MusicMeta } from './music-analysis'
import type { Recipe } from '../director/recipe'
import { generatePresentation, type GenerateLabels } from '../director/generate'
import { analyzeMusic, offsetForDrop, projectRhythm, syncProjectToMusic, toMono } from './music-analysis'

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

export function rhythmFor(project: EditProject) {
  if (project.audio.kind === 'builtin' && project.audio.trackId && project.audio.trackId in BED_RHYTHM) {
    return BED_RHYTHM[project.audio.trackId as keyof typeof BED_RHYTHM]
  }
  // A user file, or a TikTok sound known only by its taps: either way, a grid.
  if (project.audio.kind !== 'builtin' && project.audio.music) {
    return projectRhythm(project.audio.music, project.audio.offsetSec)
  }
  return null
}

// ── Sounds ─────────────────────────────────────────────────────────────────────

/**
 * Bring in a sound: an audio file, or a video (a TikTok/Reel saved from the
 * app) whose soundtrack we take. Decoded and analysed locally — the file never
 * leaves the browser. Then the edit is synced to it straight away.
 */
export interface SoundImportOptions {
  /** Shown on the timeline; defaults to the file's name. */
  name?: string
  /** A live recording: cut the silence before the sound started. */
  trimLeadingSilence?: boolean
  /**
   * Keep only the beat grid, not the audio (a microphone recording of a phone
   * speaker is timing, not something to publish). The sound is then added in
   * the app, as with tap tempo.
   */
  timingOnly?: boolean
  link?: SoundLink
}

/** Decode (at the export rate) and analyse a sound; optionally cut the silence before it starts. */
export async function analyseSound(file: File | Blob, trimLeadingSilence = false): Promise<{ buffer: AudioBuffer; music: MusicMeta; mono: Float32Array }> {
  let buffer = await decodeUserAudio(file, new OfflineAudioContext(2, 1, 48_000))
  if (trimLeadingSilence) {
    const raw = toMono(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)))
    buffer = sliceBuffer(buffer, soundStart(raw, buffer.sampleRate))
  }
  const mono = toMono(Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i)))
  return { buffer, music: analyzeMusic(mono, buffer.sampleRate), mono }
}

export async function importSound(file: File | Blob, label = 'Analysing sound', opts: SoundImportOptions = {}): Promise<void> {
  const s = useClipStudioStore.getState()
  s.setJob({ label, progress: null })
  try {
    const { buffer, music } = await analyseSound(file, opts.trimLeadingSilence)
    const name = opts.name ?? (file instanceof File ? file.name : 'sound')
    if (opts.timingOnly) {
      s.edit((p) => {
        const next: EditProject = { ...p, audio: { ...p.audio, kind: p.audio.kind === 'builtin' ? 'none' : p.audio.kind, music, link: opts.link ?? p.audio.link } }
        return next.clips.length > 0 ? syncProjectToMusic(next, music) : next
      })
      return
    }
    s.setSound(buffer)
    s.edit((p) => {
      const withSound: EditProject = {
        ...p,
        audio: { ...p.audio, kind: 'user', trackId: null, fileName: name, music, link: opts.link ?? p.audio.link, rights: p.audio.rights ?? 'viral', offsetSec: offsetForDrop(music, 0) },
      }
      return withSound.clips.length > 0 ? syncProjectToMusic(withSound, music) : withSound
    })
  } finally {
    s.setJob(null)
  }
}

/** A sound ready to cut a clip to: its beat grid, and its audio when we may embed it. */
export interface ReadySound {
  link: SoundLink | null
  name: string
  music: MusicMeta
  /** Clean audio (a tab capture or a file). Null = timing only; the sound is added in the app. */
  buffer: AudioBuffer | null
}

/**
 * The whole "clip from this sound" in one go: render the model's shots cut to
 * the sound's own beat and length, then time them to it — reveal on the drop,
 * cuts on the beat, the chosen style, ending on a bar line.
 */
export async function clipFromSound(
  sound: ReadySound,
  style: TemplateId,
  recipe: Recipe,
  lang: string,
  labels: GenerateLabels,
  templateLabels: TemplateContext['labels'],
  signal?: AbortSignal,
  captionsOnBeat = true,
): Promise<void> {
  const cut = cutForSound(sound.music, recipe.targetSec)
  // The director plans to the sound's tempo and length; the music comes from the sound.
  // A quarter more footage than the clip needs, so the edit can trim to the
  // beat and still fill the full length with real motion (not slow-mo).
  await generatePresentation({ ...recipe, music: 'none', targetSec: cut.durationSec * 1.25, onBeat: true, fadeIn: false, fadeOut: false }, lang, labels, signal, { beatSec: sound.music.beatSec })
  const s = useClipStudioStore.getState()
  s.setSound(sound.buffer)
  s.edit((p) => finishSoundClip({
    ...p,
    audio: {
      ...p.audio,
      kind: sound.buffer ? 'user' : 'none', trackId: null, fileName: sound.name, volume: 1,
      link: sound.link ?? undefined, rights: p.audio.rights ?? 'viral',
    },
  }, sound.music, cut, style, { rhythm: null, dropAt: null, labels: templateLabels }, captionsOnBeat))
  if (sound.link) rememberSound(sound.link, sound.music)
}

// ── Export ─────────────────────────────────────────────────────────────────────

export async function exportStudio(signal?: AbortSignal, label = 'Exporting', withMusic = true): Promise<Blob> {
  const s = useClipStudioStore.getState()
  const { media, output } = s
  let { project } = s
  let bed: AudioBuffer | null = null
  if (!withMusic) {
    // "Add the sound in the app": picture timed to the sound, but no music in the file.
    project = { ...project, audio: { ...project.audio, kind: 'none' } }
  } else if (project.audio.kind === 'builtin' && project.audio.trackId) {
    bed = await getBuiltInBed(project.audio.trackId as Parameters<typeof getBuiltInBed>[0], 48_000)
  } else if (project.audio.kind === 'user') {
    bed = s.sound
  }
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
