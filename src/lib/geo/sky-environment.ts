// ─── sky-environment ──────────────────────────────────────────────────────────
// A procedural sky, prefiltered into an environment map.
//
// WHY THIS EXISTS AT ALL. Physically based materials get roughly half their
// light from the environment: the sky is what a wet road reflects, what puts the
// sheen on water, and what fills the shadow side of everything. This scene had
// `scene.environment` unset, which means every PBR material was lit by direct
// lights alone — the classic "plastic in a black room" look. No amount of
// shader work on the surfaces themselves fixes that; the missing term is the
// environment, and it has to exist before PBR is worth switching on.
//
// WHY PROCEDURAL AND NOT AN HDRI. The usual answer is to ship a .hdr, which is
// megabytes of download, a licence to track and a fixed time of day. This one is
// computed in a few milliseconds from the sun the user already controls, so the
// sky agrees with the terrain hillshade and moves when they move the sliders.
// It is a Preetham-style gradient, not a full atmospheric scattering model —
// enough to light a scene convincingly, and honest about being an approximation.

import * as THREE from 'three'

export interface SkyOptions {
  /** Bearing the sun comes FROM, degrees clockwise from north. */
  sunAzimuthDeg: number
  /** Sun height above the horizon, degrees. */
  sunAltitudeDeg: number
}

/**
 * Equirectangular resolution. Small on purpose: the PMREM blur that makes this
 * usable as an irradiance source throws away high frequencies anyway, and the
 * only sharp feature is the sun disc, which survives at this size.
 */
const WIDTH = 256
const HEIGHT = 128

/** Zenith, horizon and ground tones for a clear day. */
const ZENITH = new THREE.Color(0.16, 0.30, 0.62)
const HORIZON = new THREE.Color(0.62, 0.72, 0.85)
const GROUND = new THREE.Color(0.16, 0.15, 0.14)
/** The sun's own colour, warmed as it drops toward the horizon. */
const SUN_HIGH = new THREE.Color(1.0, 0.96, 0.88)
const SUN_LOW = new THREE.Color(1.0, 0.62, 0.36)

/**
 * Build the equirectangular sky as float RGBA.
 *
 * Rows run from +Y (zenith) at v=0 to −Y at v=1, and columns from −Z going
 * clockwise — three's own equirectangular convention, so the result can be fed
 * straight to PMREMGenerator without a flip.
 */
export function buildSkyTexture(opts: SkyOptions): THREE.DataTexture {
  const data = new Float32Array(WIDTH * HEIGHT * 4)

  const az = (opts.sunAzimuthDeg * Math.PI) / 180
  const alt = (opts.sunAltitudeDeg * Math.PI) / 180
  // Same frame as everything else in the geo system: +x east, +y north, +z up,
  // then mapped into three's Y-up world where north is −Z.
  const sun = new THREE.Vector3(
    Math.cos(alt) * Math.sin(az),
    Math.sin(alt),
    -Math.cos(alt) * Math.cos(az),
  ).normalize()

  // A low sun is redder and dimmer; a high one is near-white and strong.
  const lowness = 1 - Math.min(1, Math.max(0, opts.sunAltitudeDeg / 35))
  const sunColor = SUN_HIGH.clone().lerp(SUN_LOW, lowness)
  const sunIntensity = 22 * (0.35 + 0.65 * Math.sin(Math.max(0.05, alt)))

  const dir = new THREE.Vector3()
  const colour = new THREE.Color()

  for (let y = 0; y < HEIGHT; y++) {
    const theta = ((y + 0.5) / HEIGHT) * Math.PI          // 0 = zenith
    const sinT = Math.sin(theta)
    const cosT = Math.cos(theta)
    for (let x = 0; x < WIDTH; x++) {
      const phi = ((x + 0.5) / WIDTH) * Math.PI * 2
      dir.set(sinT * Math.sin(phi), cosT, -sinT * Math.cos(phi))

      const up = dir.y
      if (up >= 0) {
        // Sky: zenith to horizon, with the horizon band compressed the way the
        // real one is — most of the gradient happens in the lowest 20°.
        const t = Math.pow(1 - up, 3)
        colour.copy(ZENITH).lerp(HORIZON, t)
        // Forward scattering: the sky brightens and warms around the sun.
        const cosGamma = Math.max(0, dir.dot(sun))
        colour.lerp(sunColor, Math.pow(cosGamma, 6) * 0.45 * (1 - up * 0.4))
      } else {
        // Below the horizon: the ground bounce. Dim, and tinted by nothing in
        // particular — this is the term that keeps undersides from going black.
        colour.copy(GROUND).lerp(HORIZON, Math.pow(1 + up, 8) * 0.5)
      }

      // The sun disc itself. Half a degree across in reality; widened here
      // because at 256 px a true-size disc lands between texels and flickers.
      const cosGamma = dir.dot(sun)
      const disc = Math.pow(Math.max(0, cosGamma), 2200)
      if (disc > 1e-4) {
        colour.r += sunColor.r * disc * sunIntensity
        colour.g += sunColor.g * disc * sunIntensity
        colour.b += sunColor.b * disc * sunIntensity
      }

      const o = (y * WIDTH + x) * 4
      data[o] = colour.r
      data[o + 1] = colour.g
      data[o + 2] = colour.b
      data[o + 3] = 1
    }
  }

  const texture = new THREE.DataTexture(data, WIDTH, HEIGHT, THREE.RGBAFormat, THREE.FloatType)
  texture.mapping = THREE.EquirectangularReflectionMapping
  // Linear working space: this is radiance, not an sRGB image.
  texture.colorSpace = THREE.LinearSRGBColorSpace
  texture.needsUpdate = true
  return texture
}

/**
 * Prefilter the sky into an environment map ready for `scene.environment`.
 *
 * The caller owns the result and must dispose it. PMREM generation is the
 * expensive part (a few ms), which is why the sky is rebuilt only when the sun
 * actually moves rather than every frame.
 */
export function buildSkyEnvironment(
  renderer: THREE.WebGLRenderer, opts: SkyOptions,
): THREE.Texture {
  const equirect = buildSkyTexture(opts)
  const pmrem = new THREE.PMREMGenerator(renderer)
  pmrem.compileEquirectangularShader()
  const target = pmrem.fromEquirectangular(equirect)
  // Both the source and the generator are scaffolding — only the cube target's
  // texture outlives this call, and leaking either would cost real GPU memory
  // every time the user nudges the sun.
  equirect.dispose()
  pmrem.dispose()
  return target.texture
}
