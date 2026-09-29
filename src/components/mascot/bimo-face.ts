// ─── Bimo face model ─────────────────────────────────────────────────────────
// The 2D twin of public/mascot/mascot.json (Blender shape keys). Same emotion
// names and the same intent per emotion, expressed as a handful of numbers the
// SVG in Bimo.tsx interpolates between — so the blog, the app and the 3D
// renders all show the same character. Pure: no React, tested in bimo.test.ts.

export const BIMO_EMOTIONS = [
  'idle', 'happy', 'excited', 'curious', 'thinking', 'sad',
  'surprised', 'love', 'sleepy', 'wave', 'angry',
] as const

export type BimoEmotion = (typeof BIMO_EMOTIONS)[number]

export interface BimoFace {
  /** 0 open … 1 closed (lid comes down). */
  blink: number
  /** 0 round eye … 1 "^" happy arc. */
  happyEye: number
  /** Eye scale; 1 = rest, >1 wide. */
  eyeScale: number
  /** Brow tilt: +1 sad (outer ends down), −1 angry (inner ends down). */
  brow: number
  /** Pupils look up (0…1). */
  lookUp: number
  /** −1 frown … +1 smile. */
  smile: number
  /** 0 closed … 1 open mouth. */
  mouthOpen: number
  /** 0 … 1 "o" mouth. */
  mouthO: number
  blush: number
  /** Visor glow multiplier. */
  glow: number
  /** Eye colour override (hex). */
  tint?: string
}

const REST: BimoFace = {
  blink: 0, happyEye: 0, eyeScale: 1, brow: 0, lookUp: 0,
  smile: 0.45, mouthOpen: 0, mouthO: 0, blush: 0.35, glow: 1,
}

const FACES: Record<BimoEmotion, Partial<BimoFace>> = {
  idle:      {},
  happy:     { happyEye: 1, smile: 1, mouthOpen: 0.35, blush: 0.8 },
  excited:   { eyeScale: 1.18, happyEye: 0.5, smile: 0.8, mouthOpen: 1, blush: 0.6, glow: 1.5 },
  curious:   { eyeScale: 1.1, lookUp: 0.4, smile: 0, mouthO: 0.45, blush: 0.25 },
  thinking:  { lookUp: 1, blink: 0.25, smile: -0.25, mouthO: 0.2, blush: 0.15 },
  sad:       { brow: 1, smile: -0.9, blush: 0.1, glow: 0.55 },
  surprised: { eyeScale: 1.3, smile: 0, mouthO: 1, mouthOpen: 0.4, blush: 0.2, glow: 1.3 },
  love:      { happyEye: 0.9, smile: 0.9, blush: 1, tint: '#FF9CC8' },
  sleepy:    { blink: 0.82, smile: 0, mouthO: 0.3, blush: 0.2, glow: 0.5 },
  wave:      { happyEye: 0.7, smile: 1, mouthOpen: 0.2, blush: 0.4 },
  angry:     { brow: -1, smile: -1, blush: 0, tint: '#FF8A8A', glow: 1.2 },
}

export function faceFor(emotion: BimoEmotion): BimoFace {
  return { ...REST, ...FACES[emotion] }
}

export function isBimoEmotion(v: unknown): v is BimoEmotion {
  return typeof v === 'string' && (BIMO_EMOTIONS as readonly string[]).includes(v)
}

/** Maps a 0–100 score (Health Score, quiz, checklist) to how Bimo feels about it. */
export function emotionForScore(score: number): BimoEmotion {
  if (!Number.isFinite(score)) return 'idle'
  if (score >= 100) return 'excited'
  if (score >= 85) return 'happy'
  if (score >= 60) return 'curious'
  if (score >= 35) return 'thinking'
  return 'sad'
}

/**
 * Where the pupils sit when looking at a point. `dx, dy` are the pointer's
 * offset from the eyes in px; the result is clamped to a disc of `max` so the
 * pupil never leaves the eye, and eased so small movements still register.
 */
export function gazeOffset(dx: number, dy: number, max = 1): { x: number; y: number } {
  const d = Math.hypot(dx, dy)
  if (d < 1e-6) return { x: 0, y: 0 }
  const reach = max * (1 - Math.exp(-d / 220))
  return { x: (dx / d) * reach, y: (dy / d) * reach }
}

/** SVG path for the mouth: a quadratic curve whose sag follows `smile`. */
export function mouthPath(f: BimoFace, cx = 60, cy = 66, w = 9): string {
  const sag = f.smile * 5
  return `M${cx - w} ${cy} Q${cx} ${cy + sag} ${cx + w} ${cy}`
}
