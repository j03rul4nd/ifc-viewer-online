// ─── Generate a presentation — facts → plan → render, in one call ─────────────

import { linkedViewer } from '../capture/viewer-link'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import { gatherSceneFacts, type ReviewWords } from './facts'
import { planPresentation, type PlanStrings, type SceneFacts } from './plan'
import { applyLook, rhythmForMusic, runDirector, type RunLabels } from './run'
import { LOOKS, type LookId } from './looks'
import { cameraAt, defaultShot } from '../capture/shots'
import { applyGrade, gradeFilter, letterboxBar } from '../capture/grade'
import { createTextOverlay } from '../capture/timeline'
import { drawTextCardsAt } from '../capture/compositor'
import type { Recipe } from './recipe'
import type { SystemKey } from './systems'

export interface GenerateLabels extends RunLabels {
  plan: PlanStrings
  system: (key: SystemKey) => string
  analysing: string
  review: ReviewWords
}

export class NothingToPresentError extends Error {
  constructor() { super('Nothing to present — open a model first') }
}

/** What the current scene offers each section — shown next to the recipe. */
export async function inspectScene(lang: string, system: (key: SystemKey) => string, review?: ReviewWords): Promise<SceneFacts | null> {
  const viewer = linkedViewer()
  if (!viewer) return null
  return gatherSceneFacts(viewer, { lang, systemLabel: system, review })
}

export async function generatePresentation(
  recipe: Recipe, lang: string, labels: GenerateLabels, signal?: AbortSignal,
): Promise<{ clips: number; exported: number; reused: number }> {
  const viewer = linkedViewer()
  if (!viewer) throw new NothingToPresentError()
  const s = useClipStudioStore.getState()
  s.setJob({ label: labels.analysing, progress: 0 })
  let facts: SceneFacts
  try {
    facts = await gatherSceneFacts(viewer, {
      lang, systemLabel: labels.system, review: labels.review,
      maxStoreys: 40, maxIssues: recipe.maxIssues,
    })
  } finally {
    s.setJob(null)
  }
  const clips = planPresentation(recipe, facts, labels.plan, rhythmForMusic(recipe.music))
  if (clips.length === 0) throw new NothingToPresentError()
  const { exported, reused } = await runDirector(viewer, clips, recipe, labels, signal)
  return { clips: clips.length, exported, reused }
}

/**
 * One still of the loaded model in a look — paint, light, backdrop, grade and
 * title — rendered at a small size so the template editor can show what a
 * look does to THIS building before anything is generated. The scene is put
 * back afterwards. Null when there is no model.
 */
export async function previewLook(lookId: LookId, title: string, width = 480, height = 270): Promise<string | null> {
  const viewer = linkedViewer()
  const bounds = viewer?.getModelBounds()
  if (!viewer || !bounds) return null
  const look = LOOKS[lookId] ?? LOOKS.native
  const restore = await applyLook(viewer, look)
  try {
    const shot = { ...defaultShot('reveal', bounds, width / height, 4) }
    await viewer.beginShotRender(width, height)
    let gl: HTMLCanvasElement
    try {
      await viewer.renderShotFrame(cameraAt(shot, 3))
      gl = await viewer.renderShotFrame(cameraAt(shot, 3))
      const c = document.createElement('canvas')
      c.width = width
      c.height = height
      const ctx = c.getContext('2d')
      if (!ctx) return null
      const filter = gradeFilter(look.grade ?? undefined)
      if (filter !== 'none' && typeof ctx.filter === 'string') ctx.filter = filter
      ctx.drawImage(gl, 0, 0, width, height)
      ctx.filter = 'none'
      applyGrade(ctx, width, height, look.grade ?? undefined, 0)
      const card = createTextOverlay({
        text: title, startSec: 0, endSec: 2, style: 'title', anchor: look.id === 'native' ? 'mid-center' : 'top-center', anim: 'none',
        ...(look.id !== 'native' ? { color: look.type.ink, font: look.type.titleFamily, uppercase: look.type.uppercase || undefined } : {}),
      }, 2)
      const bar = letterboxBar(look.grade ?? undefined, width, height)
      ctx.save()
      ctx.translate(0, bar)
      drawTextCardsAt(ctx, [card], 1, width, height - bar * 2)
      ctx.restore()
      return c.toDataURL('image/jpeg', 0.85)
    } finally {
      await viewer.endShotRender()
    }
  } finally {
    await restore()
  }
}
