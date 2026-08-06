// ─── Scene background — pure logic ─────────────────────────────────────────────
// Presentation backdrops for the 3D scene. Users shooting screenshots and clips
// for a client deck rarely want the default near-black studio: they want white,
// a soft studio gradient, or their company colour.
//
// This module is deliberately Three.js-free so every decision (which colour the
// fog takes, when the grid must flip to dark lines, what a stored preference
// deserialises to) is unit-testable. viewer.ts turns the resolved shape into
// actual scene objects; nothing here knows a Texture exists.

/** Built-in backdrops offered in the UI, plus the user-defined escape hatch. */
export type BackgroundPresetId = 'studio' | 'white' | 'paper' | 'blueprint' | 'sky' | 'custom'

/** Solid fill, or a vertical two-stop gradient (the "soft studio" look). */
export type BackgroundMode = 'solid' | 'gradient'

export interface BackgroundSettings {
  preset: BackgroundPresetId
  mode: BackgroundMode
  /** Solid fill colour, or the TOP stop of a gradient. Normalised '#rrggbb'. */
  top: string
  /** BOTTOM stop of a gradient. Ignored while mode === 'solid'. */
  bottom: string
}

/** What viewer.ts consumes: settings with every derived colour resolved. */
export interface ResolvedBackground extends BackgroundSettings {
  /** Fog colour — always the horizon (bottom) stop, so geometry fades into it. */
  fog: string
  /** Grid line colour, flipped to dark ink over light backdrops. */
  grid: string
  /** True when the backdrop is light enough to need dark UI/grid contrast. */
  light: boolean
}

// ── Presets ────────────────────────────────────────────────────────────────────

export interface BackgroundPreset {
  id: Exclude<BackgroundPresetId, 'custom'>
  mode: BackgroundMode
  top: string
  bottom: string
}

/**
 * Order is the order shown in the picker. `studio` is first because it is the
 * default and the only one that changes nothing for existing users.
 */
export const BACKGROUND_PRESETS: readonly BackgroundPreset[] = [
  // The shipped look — near-black with a matching fog.
  { id: 'studio',    mode: 'solid',    top: '#0a0a0c', bottom: '#0a0a0c' },
  // Flat white — what a printed report or a slide deck wants.
  { id: 'white',     mode: 'solid',    top: '#ffffff', bottom: '#ffffff' },
  // Soft studio sweep: white overhead falling to a light grey floor line.
  { id: 'paper',     mode: 'gradient', top: '#ffffff', bottom: '#e4e8ef' },
  // Deep technical blue — pairs with the blueprint model style.
  { id: 'blueprint', mode: 'gradient', top: '#123a63', bottom: '#0a1e36' },
  // Daylight backdrop for exterior shots.
  { id: 'sky',       mode: 'gradient', top: '#b9d4f0', bottom: '#f3f6fa' },
] as const

/** The shipped default — must stay byte-identical to the pre-feature scene. */
export const DEFAULT_BACKGROUND: BackgroundSettings = {
  preset: 'studio',
  mode: 'solid',
  top: '#0a0a0c',
  bottom: '#0a0a0c',
}

export function presetById(id: BackgroundPresetId): BackgroundPreset | null {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? null
}

/** Settings for a named preset (identity for 'custom' — it has no fixed colours). */
export function settingsFromPreset(id: BackgroundPresetId, current?: BackgroundSettings): BackgroundSettings {
  const preset = presetById(id)
  if (!preset) {
    return { ...(current ?? DEFAULT_BACKGROUND), preset: 'custom' }
  }
  return { preset: preset.id, mode: preset.mode, top: preset.top, bottom: preset.bottom }
}

// ── Colour utilities ───────────────────────────────────────────────────────────

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Normalise user input to lowercase '#rrggbb', expanding the 3-digit form.
 * Returns null for anything unparseable — callers keep the previous colour
 * rather than pushing an invalid value into the scene.
 */
export function normalizeHex(input: string): string | null {
  const m = HEX_RE.exec(input.trim())
  if (!m) return null
  const hex = m[1].toLowerCase()
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  return `#${full}`
}

/** Channel triple in 0–255, or null when the hex is invalid. */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const norm = normalizeHex(hex)
  if (!norm) return null
  return {
    r: parseInt(norm.slice(1, 3), 16),
    g: parseInt(norm.slice(3, 5), 16),
    b: parseInt(norm.slice(5, 7), 16),
  }
}

/**
 * WCAG relative luminance (0 = black, 1 = white). Used for the one decision
 * that matters visually: whether grid lines must switch to dark ink.
 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex)
  if (!rgb) return 0
  const channel = (v: number): number => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** True when a backdrop needs dark foreground contrast. */
export function isLightBackground(settings: Pick<BackgroundSettings, 'mode' | 'top' | 'bottom'>): boolean {
  const top = relativeLuminance(settings.top)
  const bottom = settings.mode === 'gradient' ? relativeLuminance(settings.bottom) : top
  // Average the two stops — a white-to-charcoal sweep is genuinely mid-tone and
  // either grid colour reads acceptably, so the midpoint is the honest test.
  return (top + bottom) / 2 > 0.45
}

/** Grid line colour with usable contrast against the backdrop. */
export function gridColorFor(settings: Pick<BackgroundSettings, 'mode' | 'top' | 'bottom'>): string {
  return isLightBackground(settings) ? '#9aa3b2' : '#2a2d36'
}

// ── Resolution ─────────────────────────────────────────────────────────────────

/**
 * Fill in every derived colour. Solid mode collapses both stops to `top` so
 * downstream code never has to special-case the gradient.
 */
export function resolveBackground(settings: BackgroundSettings): ResolvedBackground {
  const top = normalizeHex(settings.top) ?? DEFAULT_BACKGROUND.top
  const bottom = settings.mode === 'gradient'
    ? (normalizeHex(settings.bottom) ?? top)
    : top
  const base = { preset: settings.preset, mode: settings.mode, top, bottom }
  return {
    ...base,
    // The horizon stop is what distant geometry actually fades into.
    fog: bottom,
    grid: gridColorFor(base),
    light: isLightBackground(base),
  }
}

// ── Persistence ────────────────────────────────────────────────────────────────

export const BACKGROUND_STORAGE_KEY = 'ifc-scene-background:v1'

/**
 * Parse a stored preference. Anything malformed — hand-edited storage, a value
 * written by a future version — falls back to the shipped default rather than
 * throwing at viewer start-up.
 */
export function parseStoredBackground(raw: string | null): BackgroundSettings {
  if (!raw) return DEFAULT_BACKGROUND
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_BACKGROUND
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BACKGROUND
  const o = parsed as Record<string, unknown>

  const preset = typeof o.preset === 'string' && (o.preset === 'custom' || presetById(o.preset as BackgroundPresetId))
    ? (o.preset as BackgroundPresetId)
    : null
  if (!preset) return DEFAULT_BACKGROUND

  // A named preset is authoritative: re-derive its colours so a preset tweak in
  // a later release reaches users who picked it, instead of freezing old hexes.
  if (preset !== 'custom') return settingsFromPreset(preset)

  const top = typeof o.top === 'string' ? normalizeHex(o.top) : null
  const bottom = typeof o.bottom === 'string' ? normalizeHex(o.bottom) : null
  if (!top) return DEFAULT_BACKGROUND
  const mode: BackgroundMode = o.mode === 'gradient' ? 'gradient' : 'solid'
  return { preset: 'custom', mode, top, bottom: bottom ?? top }
}

export function serializeBackground(settings: BackgroundSettings): string {
  return JSON.stringify({
    preset: settings.preset,
    mode: settings.mode,
    top: settings.top,
    bottom: settings.bottom,
  })
}
