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

export type SocialPresetId = 'original' | 'reel' | 'post' | 'portrait' | 'wide' | 'email'

export const SOCIAL_PRESET_IDS: readonly SocialPresetId[] = ['original', 'reel', 'post', 'portrait', 'wide', 'email']

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

/** 600 px wide at 16:9 — the usual width of an email body. */
export const EMAIL_GIF_HEIGHT = 338

export const SOCIAL_PRESETS: Record<SocialPresetId, SocialPreset> = {
  original: { id: 'original', aspect: 'source',   fit: 'crop', height: null, gifFps: 10, ratioLabel: '' },
  reel:     { id: 'reel',     aspect: 'story',    fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '9:16' },
  post:     { id: 'post',     aspect: 'square',   fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '1:1' },
  portrait: { id: 'portrait', aspect: 'vertical', fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '4:5' },
  wide:     { id: 'wide',     aspect: 'wide',     fit: 'fit',  height: 1080, gifFps: 15, ratioLabel: '16:9' },
  // Email bodies are ~600 px wide and big images get clipped or blocked: a
  // 600×338 GIF at a low frame rate stays around a megabyte for a short orbit.
  email:    { id: 'email',    aspect: 'wide',     fit: 'fit',  height: EMAIL_GIF_HEIGHT, gifFps: 8, ratioLabel: '600px' },
}

/**
 * Which preset the current settings correspond to, or null when the user has
 * hand-tuned away from all of them. Resolution is deliberately NOT part of the
 * match: dropping a Reel to 480p for a smaller GIF is still a Reel. The one
 * exception is Email, which is Wide at exactly EMAIL_GIF_HEIGHT.
 */
export function matchSocialPreset(aspect: CaptureAspect, fit: FrameFit, height?: number | null): SocialPresetId | null {
  // Email shares Wide's frame; only its small output height tells them apart.
  if (aspect === 'wide' && fit === 'fit' && height === EMAIL_GIF_HEIGHT) return 'email'
  for (const id of SOCIAL_PRESET_IDS) {
    if (id === 'email') continue
    const p = SOCIAL_PRESETS[id]
    if (p.aspect === aspect && (aspect === 'source' || p.fit === fit)) return id
  }
  return null
}
