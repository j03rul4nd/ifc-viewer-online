// ─── Light: time of day for a capture ─────────────────────────────────────────
// The viewer's default is a studio light: even, slightly blue, made to inspect
// a model. A presentation wants a moment instead — low warm sun that rakes the
// facade, the flat light of an overcast day that shows every material, the
// blue hour. Each preset moves the key light (azimuth/elevation), recolours the
// sky/ground ambient and the fill, and brings a sky backdrop to match.
//
// Pure data; the viewer's setLighting() applies `light`, the studio sets the
// backdrop. The sun's azimuth can be overridden so a facade can be lit from
// the side the photographer would choose.

import type { SceneLighting } from '../viewer'

export type LightId = 'studio' | 'morning' | 'noon' | 'golden' | 'overcast' | 'dusk'

export const LIGHT_IDS: readonly LightId[] = ['studio', 'morning', 'noon', 'golden', 'overcast', 'dusk']

export interface LightPreset {
  id: LightId
  /** Null = the viewer's own lighting. */
  light: SceneLighting | null
  /** Sky gradient behind the model while capturing; null keeps the backdrop. */
  sky: { top: string; bottom: string } | null
}

export const LIGHTS: Record<LightId, LightPreset> = {
  studio: { id: 'studio', light: null, sky: null },
  morning: {
    id: 'morning',
    light: { sky: '#EAF2FF', ground: '#8C8A84', ambient: 0.9, key: '#FFF1DC', keyIntensity: 1.6, azimuth: 115, elevation: 32, fill: '#C9D8F0', fillIntensity: 0.35 },
    sky: { top: '#B9D3EE', bottom: '#F3F0EA' },
  },
  noon: {
    id: 'noon',
    light: { sky: '#FFFFFF', ground: '#9A968E', ambient: 0.85, key: '#FFFFFF', keyIntensity: 1.9, azimuth: 35, elevation: 66, fill: '#DDE6F0', fillIntensity: 0.3 },
    sky: { top: '#9FC4EA', bottom: '#EEF3F8' },
  },
  golden: {
    id: 'golden',
    light: { sky: '#FFE2C0', ground: '#6B4A33', ambient: 0.7, key: '#FFB468', keyIntensity: 2.3, azimuth: 300, elevation: 13, fill: '#7FA9C0', fillIntensity: 0.45 },
    sky: { top: '#E6A77A', bottom: '#FBE6D2' },
  },
  overcast: {
    id: 'overcast',
    light: { sky: '#F2F4F6', ground: '#8E9296', ambient: 1.35, key: '#F4F6F8', keyIntensity: 0.7, azimuth: 45, elevation: 60, fill: '#E0E4E8', fillIntensity: 0.5 },
    sky: { top: '#CDD2D8', bottom: '#EDEFF1' },
  },
  dusk: {
    id: 'dusk',
    light: { sky: '#7483BB', ground: '#1A1C2A', ambient: 0.65, key: '#FFC48A', keyIntensity: 1.25, azimuth: 250, elevation: 8, fill: '#5A6FB0', fillIntensity: 0.6 },
    sky: { top: '#1B2548', bottom: '#8C7D9E' },
  },
}

/** The preset's light with the sun turned to `azimuth` (degrees), if given. */
export function resolveLight(id: LightId, azimuth: number | null): SceneLighting | null {
  const l = LIGHTS[id]?.light ?? null
  if (!l) return null
  if (azimuth === null || !Number.isFinite(azimuth)) return l
  return { ...l, azimuth: ((azimuth % 360) + 360) % 360 }
}
