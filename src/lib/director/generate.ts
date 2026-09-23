// ─── Generate a presentation — facts → plan → render, in one call ─────────────

import { linkedViewer } from '../capture/viewer-link'
import { useClipStudioStore } from '../../stores/clipStudioStore'
import { gatherSceneFacts } from './facts'
import { planPresentation, type PlanStrings, type SceneFacts } from './plan'
import { rhythmForMusic, runDirector, type RunLabels } from './run'
import type { Recipe } from './recipe'
import type { SystemKey } from './systems'

export interface GenerateLabels extends RunLabels {
  plan: PlanStrings
  system: (key: SystemKey) => string
  analysing: string
}

export class NothingToPresentError extends Error {
  constructor() { super('Nothing to present — open a model first') }
}

/** What the current scene offers each section — shown next to the recipe. */
export async function inspectScene(lang: string, system: (key: SystemKey) => string): Promise<SceneFacts | null> {
  const viewer = linkedViewer()
  if (!viewer) return null
  return gatherSceneFacts(viewer, { lang, systemLabel: system })
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
      lang, systemLabel: labels.system,
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
