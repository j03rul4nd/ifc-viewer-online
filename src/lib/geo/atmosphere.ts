// ─── atmosphere ───────────────────────────────────────────────────────────────
// The air between the camera and the far city: a sky that is anchored to the
// WORLD, and a haze whose range follows the view.
//
// ── What was wrong ────────────────────────────────────────────────────────────
//
// Map mode had both halves of an atmosphere and neither did its job.
//
//   THE SKY was a gradient in SCREEN space: zenith at the top of the canvas, the
//   fog colour at 82 % of its height, wherever the camera happened to point.
//   Tilt the view and the horizon climbs into the deep blue part of the
//   gradient, so the far map — bright, and unfogged — met a saturated sky along
//   a ruled line. Look down and the "sky" was still up there, behind the ground.
//
//   THE FOG ran from 30 km to 55 km. A scene is a district: the buildings stop
//   at 700 m and the relief at about 1.4 km. Nothing the reader can see was ever
//   inside the fog, so there was no depth cue between the near blocks and the
//   far ones, and the place where the modelled city gives way to a flat map was
//   drawn at full contrast.
//
// ── What this does ────────────────────────────────────────────────────────────
//
//   • `buildSkyDomePixels` paints an equirectangular sky by ELEVATION ANGLE: the
//     haze colour at and below the horizon, the horizon tint a few degrees up,
//     the zenith overhead, and the light gathering around the sun. Used as
//     `scene.background` it turns with the camera like a real sky, and its
//     lowest band is exactly the colour the fog fades to — so the far map
//     dissolves into the sky in every direction and at every tilt.
//
//   • `hazeRangeFor` gives the fog a range that scales with how far away the
//     thing being looked at is. Close in, the street is crisp and the far city
//     is a tone lighter; from a kilometre up, the same proportion holds. That
//     proportion — not an absolute distance — is what reads as air.
//
//   • `equirectDirection` is the ONE mapping from a texel to a direction, shared
//     with the environment map that lights the scene (sky-environment.ts). The
//     sky you see and the sky that lights are then the same sky by construction.
//     They were not: the environment was written upside down and a quarter turn
//     round, so every surface was lit by the ground from above.
//
// PURE: numbers and arrays. No THREE, no canvas, no scene — the callers wrap the
// result in whatever texture they need.

import { hexToRgb, srgbToLinear } from './map-look'

// ── Equirectangular convention ────────────────────────────────────────────────

/**
 * Direction a texel of an equirectangular DataTexture is sampled FOR.
 *
 * three.js reads an equirectangular map with
 *
 *     u = atan(dir.z, dir.x) / 2π + 0.5        v = asin(dir.y) / π + 0.5
 *
 * and a DataTexture's first row is v = 0. So row 0 is the NADIR, the last row
 * is the zenith, and the column decides the bearing. This is the inverse of
 * that, taken at the texel centre — fill a texture through it and three reads
 * back exactly the direction that was written.
 *
 * World axes are the viewer's: +Y up, north = −Z, east = +X.
 */
export function equirectDirection(
  col: number, row: number, width: number, height: number,
): { x: number; y: number; z: number } {
  const a = ((col + 0.5) / width - 0.5) * Math.PI * 2
  const elevation = ((row + 0.5) / height - 0.5) * Math.PI
  const c = Math.cos(elevation)
  return { x: c * Math.cos(a), y: Math.sin(elevation), z: c * Math.sin(a) }
}

/**
 * Unit vector TOWARDS the sun, in the viewer's world axes.
 * `azimuthDeg` is the bearing the light comes from, clockwise from north.
 */
export function sunDirection(azimuthDeg: number, altitudeDeg: number): { x: number; y: number; z: number } {
  const az = (azimuthDeg * Math.PI) / 180
  const alt = (altitudeDeg * Math.PI) / 180
  return {
    x: Math.cos(alt) * Math.sin(az),
    y: Math.sin(alt),
    z: -Math.cos(alt) * Math.cos(az),
  }
}

// ── Haze ──────────────────────────────────────────────────────────────────────

export interface HazeRange {
  /** Distance at which the haze begins, metres. */
  nearM: number
  /** Distance at which everything is the haze colour, metres. */
  farM: number
}

/** The haze never starts closer than this: what is in arm's reach is never hazy. */
export const HAZE_MIN_NEAR_M = 250
/** Nor later than this, or a view from high up would have no air in it at all. */
export const HAZE_MAX_NEAR_M = 20_000
/** Furthest the haze may end — inside the camera's far plane (60 km). */
export const HAZE_FAR_CAP_M = 55_000
/** The haze begins just short of the thing being looked at… */
const HAZE_NEAR_PER_VIEW = 0.9
/** …and takes this many view-distances, plus a floor, to close completely. */
const HAZE_SPAN_PER_VIEW = 22
const HAZE_SPAN_FLOOR_M = 6_000

/**
 * The fog range for a camera `viewDistanceM` from what it is looking at.
 *
 * Linear fog, because that is what the viewer's scene already owns and every
 * material in it already compiles against. The range is what makes it read as
 * atmosphere rather than as fog:
 *
 *   • it starts just in front of the subject, so the subject keeps its full
 *     contrast and everything behind it loses a little;
 *   • it closes over a span proportional to the view, so the depth cue looks
 *     the same from 300 m and from 3 km;
 *   • it always closes — by `HAZE_FAR_CAP_M` at the latest — because the flat
 *     map runs to the far plane, and a map that reaches the horizon at full
 *     contrast is the ruled line this module exists to remove.
 *
 * `strength` thins the air for looks that are drawings rather than views
 * (1 = as designed, 0.5 = everything twice as far). Clamped to (0, 1].
 */
export function hazeRangeFor(viewDistanceM: number, strength = 1): HazeRange {
  const d = Number.isFinite(viewDistanceM) && viewDistanceM > 0 ? viewDistanceM : 0
  const s = Math.min(1, Math.max(0.1, Number.isFinite(strength) ? strength : 1))
  const nearM = Math.min(HAZE_MAX_NEAR_M, Math.max(HAZE_MIN_NEAR_M, d * HAZE_NEAR_PER_VIEW) / s)
  const span = (HAZE_SPAN_FLOOR_M + d * HAZE_SPAN_PER_VIEW) / s
  const farM = Math.min(HAZE_FAR_CAP_M, nearM + span)
  // The cap can only bite from above; keep a real interval whatever it did.
  return { nearM: Math.min(nearM, farM - 1_000), farM }
}

/** Share of the haze colour at `distanceM`, 0–1 — what linear fog computes. */
export function hazeAt(range: HazeRange, distanceM: number): number {
  return Math.min(1, Math.max(0, (distanceM - range.nearM) / (range.farM - range.nearM)))
}

/**
 * Has the range moved enough to be worth pushing to the GPU?
 *
 * The camera distance changes every frame of a zoom; the fog does not need to.
 * Two percent is far below what the eye can pick out in a gradient that is
 * kilometres long.
 */
export function hazeRangeChanged(a: HazeRange | null, b: HazeRange): boolean {
  if (!a) return true
  return Math.abs(a.nearM - b.nearM) > a.nearM * 0.02
    || Math.abs(a.farM - b.farM) > a.farM * 0.02
}

// ── Sky dome ──────────────────────────────────────────────────────────────────

export interface SkyDomeOptions {
  /** '#rrggbb' sRGB, as the light presets state them. */
  zenith: string
  horizon: string
  /** The fog colour: what the far map fades to, and so what the sky starts as. */
  haze: string
  sunHigh: string
  sunLow: string
  sunAzimuthDeg: number
  sunAltitudeDeg: number
  /** Texture size. The defaults are plenty for a gradient and a soft disc. */
  width?: number
  height?: number
}

export const SKY_DOME_WIDTH = 256
export const SKY_DOME_HEIGHT = 512

/**
 * Height of the haze band above the horizon, degrees.
 *
 * Real air does this: the lowest few degrees of any sky are the colour of the
 * distance, not of the sky. It is also what hides the difference between the
 * mathematical horizon and the edge of a finite map, which sits a fraction of
 * a degree below it.
 */
export const HAZE_BAND_DEG = 7

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function linearRgb(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex)
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)]
}

function toSrgb8(linear: number): number {
  const c = Math.min(1, Math.max(0, linear))
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
  return Math.round(s * 255)
}

/**
 * The sky as sRGB8 RGBA texels in three's equirectangular layout (row 0 =
 * nadir — see `equirectDirection`).
 *
 * Mixed in linear light and encoded once at the end, so the gradient between a
 * warm horizon and a blue zenith stays luminous instead of passing through the
 * grey an sRGB lerp gives.
 */
export function buildSkyDomePixels(opts: SkyDomeOptions): { data: Uint8Array; width: number; height: number } {
  const width = opts.width ?? SKY_DOME_WIDTH
  const height = opts.height ?? SKY_DOME_HEIGHT
  const data = new Uint8Array(width * height * 4)

  const zenith = linearRgb(opts.zenith)
  const horizon = linearRgb(opts.horizon)
  const haze = linearRgb(opts.haze)
  const sun = sunDirection(opts.sunAzimuthDeg, opts.sunAltitudeDeg)

  // A low sun is redder; one below the horizon lights nothing.
  const lowness = 1 - Math.min(1, Math.max(0, opts.sunAltitudeDeg / 35))
  const high = linearRgb(opts.sunHigh)
  const low = linearRgb(opts.sunLow)
  const sunColor: [number, number, number] = [
    high[0] + (low[0] - high[0]) * lowness,
    high[1] + (low[1] - high[1]) * lowness,
    high[2] + (low[2] - high[2]) * lowness,
  ]
  const sunUp = smoothstep(-4, 2, opts.sunAltitudeDeg)

  // Everything at or below the horizon is one colour, so those rows are filled
  // without the per-texel work — half the texture.
  const hazeRow = [toSrgb8(haze[0]), toSrgb8(haze[1]), toSrgb8(haze[2])]
  const cosDiscOuter = Math.cos((1.7 * Math.PI) / 180)
  const cosDiscInner = Math.cos((0.9 * Math.PI) / 180)

  for (let row = 0; row < height; row++) {
    const elevationDeg = ((row + 0.5) / height - 0.5) * 180
    if (elevationDeg <= 0) {
      for (let col = 0; col < width; col++) {
        const o = (row * width + col) * 4
        data[o] = hazeRow[0]; data[o + 1] = hazeRow[1]; data[o + 2] = hazeRow[2]; data[o + 3] = 255
      }
      continue
    }
    const up = Math.sin((elevationDeg * Math.PI) / 180)
    // Most of a real sky's gradient happens in its lowest 20°.
    const toHorizon = Math.pow(1 - up, 3)
    const clear = smoothstep(0, HAZE_BAND_DEG, elevationDeg)
    for (let col = 0; col < width; col++) {
      const dir = equirectDirection(col, row, width, height)
      const cosGamma = Math.max(0, dir.x * sun.x + dir.y * sun.y + dir.z * sun.z)
      // Forward scattering: a wide warm bloom, and a tighter one inside it.
      const glow = sunUp * (Math.pow(cosGamma, 8) * 0.22 + Math.pow(cosGamma, 90) * 0.4)
      const disc = sunUp * smoothstep(cosDiscOuter, cosDiscInner, cosGamma)
      const o = (row * width + col) * 4
      for (let k = 0; k < 3; k++) {
        const sky = zenith[k] + (horizon[k] - zenith[k]) * toHorizon
        let c = haze[k] + (sky - haze[k]) * clear
        c += (sunColor[k] - c) * Math.min(1, glow)
        c += (1 - c) * disc * (0.6 + 0.4 * sunColor[k])
        data[o + k] = toSrgb8(c)
      }
      data[o + 3] = 255
    }
  }
  return { data, width, height }
}
