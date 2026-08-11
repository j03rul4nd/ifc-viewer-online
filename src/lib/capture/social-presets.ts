// ─── Social export presets ─────────────────────────────────────────────────────
// One click that sets aspect + fit + resolution + GIF frame rate together,
// because "make this a Reel" is the actual user intent and picking four
// controls to spell it out is where people give up.
//
// Every non-source preset defaults to 'fit' rather than 'crop': losing half the
// building to a centre-crop is a much worse surprise than a pair of bars, and
// the editor offers a one-click Fill toggle for anyone who wants the crop.

import type { CaptureAspect } from './replay-buffer-core'
import type { FrameFit } from './frame-layout'

export type SocialPresetId = 'original' | 'reel' | 'post' | 'portrait' | 'wide'

export const SOCIAL_PRESET_IDS: readonly SocialPresetId[] = ['original', 'reel', 'post', 'portrait', 'wide']

export interface SocialPreset {
  id: SocialPresetId
  aspect: CaptureAspect
  fit: FrameFit
  /** Target output height in px; null = keep the source height. */
  height: number | null
  /** GIF frame rate that suits this destination. */
  gifFps: number
  /** Ratio shown on the chip, e.g. "9:16". Empty for the source preset. */
  ratioLabel: string
}

export const SOCIAL_PRESETS: Record<SocialPresetId, SocialPreset> = {
  original: { id: 'original', aspect: 'source',   fit: 'crop', height: null, gifFps: 10, ratioLabel: '' },
  reel:     { id: 'reel',     aspect: 'story',    fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '9:16' },
  post:     { id: 'post',     aspect: 'square',   fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '1:1' },
  portrait: { id: 'portrait', aspect: 'vertical', fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '4:5' },
  wide:     { id: 'wide',     aspect: 'wide',     fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '16:9' },
}

/**
 * Which preset the current settings correspond to, or null when the user has
 * hand-tuned away from all of them. Resolution is deliberately NOT part of the
 * match: dropping a Reel to 480p for a smaller GIF is still a Reel.
 */
export function matchSocialPreset(aspect: CaptureAspect, fit: FrameFit): SocialPresetId | null {
  for (const id of SOCIAL_PRESET_IDS) {
    const p = SOCIAL_PRESETS[id]
    if (p.aspect === aspect && (aspect === 'source' || p.fit === fit)) return id
  }
  return null
}
