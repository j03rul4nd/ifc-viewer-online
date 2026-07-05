// ─── startAutoTour — shared "generate and play" orchestration (D-24/D-25) ──────
// One place that turns validation issues into a playing tour. Used by the
// TourRecorder ("Generate tour" button) and the Client Presentation layout
// ("View walkthrough" CTA) so neither duplicates the generate→store→play chain.

import { generateAutoTour, type AutoTourViewer, type AutoTourOptions } from './generateAutoTour'
import { usePresentationStore } from '../../stores/presentationStore'
import type { ValidationIssue } from '../../types'

/**
 * Generate an auto-tour from `issues`, store it and start playback.
 * Returns false when no steps could be generated (caller decides how to
 * message that); rethrows unexpected errors for the caller's toast.
 */
export async function startAutoTour(
  viewer: AutoTourViewer,
  issues: readonly ValidationIssue[],
  title: string,
  options?: AutoTourOptions,
): Promise<boolean> {
  const tour = await generateAutoTour(issues, viewer, options)
  if (tour.steps.length === 0) return false
  const store = usePresentationStore.getState()
  store.setTour({ ...tour, title })
  store.play(0)
  return true
}
