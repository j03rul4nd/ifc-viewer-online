// ─── surface-shaders ──────────────────────────────────────────────────────────
// Procedural materials for the ground layers: grass, sand, rock, water — plus
// foliage and bark, so the trees standing on them are lit by the same sun.
//
// WHY PROCEDURAL AND NOT TEXTURES
// A texture set good enough for a client meeting is several megabytes of images
// that would have to be downloaded, cached, licensed and colour-matched, and it
// still tiles visibly at the scale we draw (a river is 400 m long on screen).
// Noise evaluated in the fragment shader has none of those problems: it ships as
// a few kB of source, never repeats, costs no network request — which matters
// here, this viewer is privacy-first and offline-capable — and can be driven by
// the same sun the terrain hillshade already uses, so the whole scene agrees on
// where the light comes from.
//
// WHY NOT THE BUILT-IN THREE MATERIALS
// MeshStandardMaterial would tie the surroundings to whatever lights the viewer
// happens to have, which change when Sun Study is on. These materials carry
// their own key light + hemispheric sky, taken from `terrainLook`, so the map
// context is internally consistent and independent of the model's lighting rig.
//
// COORDINATES — the one thing that must not be got wrong.
// Layer geometry lives in NORMALIZED web-mercator units under a geoRoot scaled
// by ~4e7. A vertex is a number like 0.5065432 with a metre worth about 4e-8 of
// it, which is barely above float32 resolution: noise sampled from `position`
// would come out in ~1.5 m blocks. Every material here reads its pattern from
// `aSurf` instead — planar METRES relative to the layer origin, computed in
// double precision on the CPU. Nothing procedural may use `position`.

import * as THREE from 'three'

/** The surfaces we can draw procedurally. */
export type SurfaceKind = 'grass' | 'sand' | 'rock' | 'water'

export interface SurfaceSun {
  /** Bearing the light comes FROM, degrees clockwise from north. */
  azimuthDeg: number
  /** Height above the horizon, degrees. */
  altitudeDeg: number
}

export interface SurfaceMaterialOptions {
  sun: SurfaceSun
  /** Base opacity for the layer; water modulates it with fresnel. */
  opacity?: number
}

/**
 * Sun direction in the LAYER's own planar frame: +x east, +y north, +z up.
 * Same convention as terrain-sampling's `sunVector`, deliberately — the relief
 * hillshade and these surfaces must be lit from the same place or the eye reads
 * two suns.
 */
export function sunDirectionLocal(sun: SurfaceSun): THREE.Vector3 {
  const az = (sun.azimuthDeg * Math.PI) / 180
  const alt = (sun.altitudeDeg * Math.PI) / 180
  const horizontal = Math.cos(alt)
  return new THREE.Vector3(
    horizontal * Math.sin(az),
    horizontal * Math.cos(az),
    Math.sin(alt),
  )
}

// ── Shared GLSL ────────────────────────────────────────────────────────────────

/**
 * Value noise, not gradient noise. It is cheaper, and for surface breakup at
 * these scales the difference is invisible; the lacunarity is nudged off 2.0 so
 * successive octaves cannot line up into a visible grid.
 */
const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p, int octaves) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    sum += amp * vnoise(p);
    p *= 2.07;
    amp *= 0.5;
  }
  return sum;
}

/** Ridged noise — the fracture lines that make rock read as rock. */
float ridge(vec2 p, int octaves) {
  return 1.0 - abs(fbm(p, octaves) * 2.0 - 1.0);
}
`

/**
 * Weight for a noise layer at the given frequency (cycles per metre), faded out
 * as its wavelength approaches the size of a pixel.
 *
 * This is the difference between detail and shimmer, and it is not optional at
 * map scale. Looking at a whole neighbourhood, one pixel covers a metre or
 * more; a 5 cm grain sampled there does not read as grain, it aliases into a
 * flat grey that cancels the layers underneath and leaves the surface looking
 * WORSE than if the detail had never been added. Fading every layer out at its
 * own Nyquist limit is what lets one material hold up both from across the
 * street and from 800 m up.
 *
 * fwidth is core in GLSL ES 3.00, which is what three compiles to on WebGL2 —
 * the only context this viewer runs in.
 */
const DETAIL_FADE_GLSL = /* glsl */ `
float detailFade(vec2 p, float cyclesPerMetre) {
  float metresPerPixel = max(fwidth(p.x), fwidth(p.y));
  return 1.0 - smoothstep(0.30, 0.80, metresPerPixel * cyclesPerMetre);
}
`

// ── The surfaces themselves ────────────────────────────────────────────────────

/**
 * Three material families, as plain functions of a planar position in METRES.
 *
 * They are functions rather than whole shaders because the terrain needs to
 * BLEND them — a mountainside is grass low down, rock on the crags and snow on
 * top, and the boundary between those has to be a gradient, not a seam. The
 * standalone OSM layer materials are thin wrappers around the same code, so
 * a park and the hillside behind it are literally the same grass.
 *
 * Each returns an albedo, a bump gradient in the surface plane (already scaled,
 * so callers just perturb by it), and a specular strength.
 */
const SURFACE_FN_GLSL = /* glsl */ `
struct Surface {
  vec3 albedo;
  vec2 grad;
  float sheen;
};

/**
 * A noise layer AND its gradient, sharing the centre sample: three evaluations
 * instead of four. Returns (value, dx, dy).
 *
 * Worth its own function because every family wants both from the same layer —
 * the albedo modulation and the bump come from the same lumps, and computing
 * that lump field twice was a third of the fragment cost.
 */
vec3 fbmAndGrad(vec2 p, float eps, int octaves) {
  float c = fbm(p, octaves);
  return vec3(
    c,
    (fbm(p + vec2(eps, 0.0), octaves) - c) / eps,
    (fbm(p + vec2(0.0, eps), octaves) - c) / eps
  );
}

/**
 * Lawn, meadow, forest floor. A ladder of scales, because that is what a real
 * sward has: tens of metres of wet/dry and mown/rough variation, metre-scale
 * wear, clump-scale texture, and a fine breakup for close-ups. \`rough\` moves it
 * from a mown pitch to heath and scrub.
 *
 * Each fine layer is SKIPPED once its own fade says it cannot be resolved. That
 * is not a micro-optimisation: the terrain fills the screen exactly when the
 * camera is far enough that those layers have faded to nothing, so the most
 * expensive frames are the ones with the least to compute.
 */
Surface grassSurface(vec2 p, float rough, vec3 tone) {
  float clumpF = 0.40;                       // 2.5 m — the texture you see
  float tuftF  = mix(1.4, 3.0, rough);       // 0.3-0.7 m
  float fineF  = 9.0;                        // 11 cm

  // Fades first, and outside every branch: fwidth needs neighbouring fragments
  // to agree on how far it has come.
  float wClump = detailFade(p, clumpF);
  float wTuft  = detailFade(p, tuftF);
  float wFine  = detailFade(p, fineF);

  float meadow = fbm(p * 0.035, 3);          // 30 m — drainage, aspect, mowing
  float wear   = fbm(p * 0.13, 3);           // 8 m  — paths, bare patches

  // Dry grass is yellower and lighter. A small move — a park is still green.
  vec3 dry = tone * vec3(1.34, 1.18, 0.70);
  vec3 albedo = mix(tone, dry, smoothstep(0.38, 0.80, meadow) * 0.5);
  albedo *= 0.80 + 0.42 * wear;

  vec2 grad = vec2(0.0);
  float clump = 0.5;
  if (wClump > 0.01) {
    vec3 c = fbmAndGrad(p * clumpF, 0.25, 2);
    clump = c.x;
    albedo *= 1.0 + (clump - 0.5) * mix(0.52, 0.84, rough) * wClump;
    grad += c.yz * (0.7 * wClump);
  }
  if (wTuft > 0.01) {
    vec3 t = fbmAndGrad(p * tuftF, 0.25, 2);
    albedo *= 1.0 + (t.x - 0.5) * 0.34 * wTuft;
    grad += t.yz * wTuft;
  }
  if (wFine > 0.01) {
    albedo *= 1.0 + (vnoise(p * fineF) - 0.5) * 0.20 * wFine;
  }

  // Self-shadowing between clumps: the gaps never see the full sky.
  albedo *= 0.84 + 0.16 * mix(0.5, clump, wClump);

  return Surface(albedo, grad * mix(0.10, 0.26, rough), 0.0);
}

/**
 * Beach, dune, shingle, mud — and wind-packed snow, which behaves the same way:
 * a fine granular surface the wind carves into regular ripples. The ripples are
 * the whole point. Flat sand-coloured polygons read as paper; what says "sand"
 * from any angle is the regular ripple, one dominant direction, bent by larger
 * drifts. High \`rough\` drops the ripples for pebble-scale lumps instead.
 */
Surface sandSurface(vec2 p, float rough, vec3 tone) {
  // Large drifts: where the surface piles up and where it is scoured.
  float drift = fbm(p * 0.035, 3);

  // Ripple bearing, bent by the drift so the crests are never dead straight.
  float bearing = 0.9 + drift * 1.6;
  vec2 dir = vec2(cos(bearing), sin(bearing));
  // Real wave ripples on a beach are ~10 cm apart and real dune ripples a few
  // metres. The short end is deliberately stretched: below about a metre the
  // crests fall under the pixel size at any view that includes the building,
  // and a ripple you cannot resolve is just noise.
  float wavelength = mix(1.1, 5.0, rough);
  float rippleF = 1.0 / wavelength;
  float pebbleF = mix(4.0, 1.6, rough);
  float grainF = 22.0;

  float wRipple = detailFade(p, rippleF);
  float wPebble = detailFade(p, pebbleF);
  float wGrain = detailFade(p, grainF);
  float rippleMix = 1.0 - smoothstep(0.55, 0.9, rough);

  vec3 albedo = tone * (0.90 + 0.24 * drift);
  vec2 grad = vec2(0.0);

  if (wRipple * rippleMix > 0.01) {
    float phase = dot(p, dir) * (6.2831853 * rippleF) + fbm(p * 0.18, 3) * 6.0;
    // Sharper than a sine: wind ripples have flat troughs and crisp crests.
    float ripple = pow(0.5 + 0.5 * sin(phase), 1.6);
    albedo *= 1.0 + (ripple - 0.5) * 0.30 * rippleMix * wRipple;
    // A low sun raking across the crests is most of what sells the surface.
    grad += dir * cos(phase) * (6.2831853 * rippleF) * rippleMix * wRipple * 0.05;
  }
  if (wPebble > 0.01) {
    vec3 pb = fbmAndGrad(p * pebbleF, 0.25, 2);
    albedo *= 1.0 + (pb.x - 0.5) * 0.26 * (1.0 - rippleMix) * wPebble;
    grad += pb.yz * (0.6 * wPebble);
  }
  if (wGrain > 0.01) {
    // Grain — what keeps sand from going plastic in a close-up.
    albedo *= 1.0 + (vnoise(p * grainF) - 0.5) * 0.16 * wGrain;
  }

  // Dry quartz sand — and fresh snow — have a real sheen at grazing angles.
  return Surface(albedo, grad * 0.55, 0.16 * (1.0 - rough));
}

/**
 * Bare rock, scree, glacier ice. Ridged noise gives the fracture pattern;
 * \`rough\` moves it from smooth ice through slabbed rock to loose scree.
 */
Surface rockSurface(vec2 p, float rough, vec3 tone) {
  float blockF = mix(0.8, 2.2, rough);       // 0.45-1.25 m
  float gritF  = 14.0;                       // 7 cm

  float wBlocks = detailFade(p, blockF);
  float wGrit = detailFade(p, gritF);

  float bed = fbm(p * 0.03, 3);              // 33 m — the shape of the massif

  // Joints and gullies, at 4.5 m: the layer that makes rock read as rock, and
  // the one that survives all the way out to a whole-mountain view.
  vec3 fr = fbmAndGrad(p * 0.22, 0.25, 3);
  float fracture = 1.0 - abs(fr.x * 2.0 - 1.0);
  vec2 grad = fr.yz * 0.8;

  float blocks = fracture;
  if (wBlocks > 0.01) {
    vec3 bl = fbmAndGrad(p * blockF, 0.25, 2);
    blocks = 1.0 - abs(bl.x * 2.0 - 1.0);
    grad += bl.yz * wBlocks;
  }

  // Crevices are darker and less saturated — dirt and shadow collect in them.
  float crev = smoothstep(0.50, 0.95, mix(fracture, blocks, 0.55 * wBlocks));
  vec3 albedo = tone * (0.80 + 0.34 * bed);
  albedo = mix(albedo, albedo * vec3(0.58, 0.57, 0.58), crev * mix(0.40, 0.80, rough));
  if (wGrit > 0.01) {
    albedo *= 1.0 + (vnoise(p * gritF) - 0.5) * 0.20 * wGrit;
  }

  return Surface(albedo, grad * mix(0.35, 0.95, rough), (1.0 - rough) * 0.35);
}
`

// ── Water ──────────────────────────────────────────────────────────────────────

/**
 * Water is not a granular surface, so it gets its own function rather than a
 * member of the family above. Under PBR most of what used to be hand-written
 * here comes for free: the fresnel rim, the sky in the surface and the sun's
 * glitter path are all just a smooth dielectric with an environment map. What
 * is left is the part no BRDF knows about — where the bank is, how deep the
 * water is, and where the foam breaks.
 */
const WATER_GLSL = /* glsl */ `
struct Water {
  vec3 albedo;
  vec2 grad;
  float roughness;
  float foam;
};

Water waterSurface(
  vec2 p, float t, float shore,
  vec3 deep, vec3 shallow, float foamM, float shallowM
) {
  // Swell and chop travel in different directions at different speeds; a
  // single scrolling layer reads as a sliding texture, two read as water.
  float swellF = 0.085;      // ~12 m crests
  float chopF  = 0.42;       // ~2.4 m
  vec2 swell = p * swellF + vec2(t * 0.36, t * 0.14);
  vec2 chop  = p * chopF  - vec2(t * 0.19, t * 0.44);

  vec3 sw = fbmAndGrad(swell, 0.25, 3);
  vec2 grad = sw.yz * (0.55 * detailFade(p, swellF));
  float chopAmount = detailFade(p, chopF);
  if (chopAmount > 0.01) {
    grad += fbmAndGrad(chop, 0.25, 2).yz * (0.22 * chopAmount);
  }

  // Depth from the bank. Not measured — OSM carries no bathymetry — but
  // "shallower at the edge" is true of every natural body of water.
  float depth = clamp(shore / shallowM, 0.0, 1.0);
  vec3 albedo = mix(shallow, deep, smoothstep(0.0, 1.0, depth));

  // Foam against the bank, torn up by noise and drifting, so the line is
  // ragged the way surf is rather than a clean offset outline.
  float fringe = fbm(p * 0.9 + vec2(t * 0.06, -t * 0.04), 3);
  float foam = 1.0 - smoothstep(0.0, foamM * (0.45 + 1.1 * fringe), shore);
  foam *= 0.55 + 0.45 * fbm(p * 2.6 - vec2(t * 0.09), 2);
  foam = clamp(foam, 0.0, 1.0);

  albedo = mix(albedo, vec3(0.92, 0.95, 0.96), foam * 0.9);

  // Open water is a near-mirror; foam is not. Getting this split right is what
  // makes the bank read as surf rather than as white paint.
  float roughness = mix(0.035, 0.62, foam);
  // Chop roughens the surface where it is disturbed, which is what breaks the
  // glitter path up into sparkles instead of one hard streak.
  roughness += length(grad) * 0.03;

  return Water(albedo, grad, clamp(roughness, 0.02, 1.0), foam);
}
`

// ── Injection into three's PBR shader ──────────────────────────────────────────

/**
 * Everything below extends MeshStandardMaterial through `onBeforeCompile`
 * rather than replacing it with a ShaderMaterial.
 *
 * This is the whole point of the PBR rewrite. A hand-written material has to
 * reimplement — badly — every one of: energy-conserving specular, image-based
 * lighting from the environment, shadow reception, light probes, fog and tone
 * mapping. Feeding procedural values INTO three's own shader keeps all of that
 * and costs only the few lines that say what the surface is made of.
 *
 * The three hooks used, in the order they appear in meshphysical_frag:
 *   map_fragment          → what colour the surface is
 *   roughnessmap_fragment → how rough it is
 *   normal_fragment_maps  → which way it faces, in the small
 * Everything after those is three's, untouched.
 */

/** Declarations shared by the vertex half of every surface material. */
function vertexInjection(water: boolean): { head: string; body: string } {
  return {
    head: /* glsl */ `
      attribute vec2 aSurf;
      attribute float aRough;
      ${water ? 'attribute float aShore;' : ''}
      varying vec2 vSurf;
      varying float vRough;
      ${water ? 'varying float vShore;' : ''}
      varying vec3 vTanX;
      varying vec3 vTanY;
    `,
    body: /* glsl */ `
      vSurf = aSurf;
      vRough = aRough;
      ${water ? 'vShore = aShore;' : ''}
      // The layer's own axes, in VIEW space — the frame the bump gradient is
      // expressed in, and the space three's \`normal\` already lives in.
      vTanX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
      vTanY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
    `,
  }
}

/** Patch a shader in place. Throws loudly if three moved a chunk we rely on. */
function replaceChunk(source: string, chunk: string, replacement: string): string {
  const token = `#include <${chunk}>`
  if (!source.includes(token)) {
    // Silent failure here would look like "the material just stopped working"
    // after a three upgrade, which is a miserable thing to debug.
    throw new Error(`surface-shaders: three no longer emits <${chunk}>`)
  }
  return source.replace(token, replacement)
}

// ── OSM ground layers ──────────────────────────────────────────────────────────

const SURFACE_FN: Record<Exclude<SurfaceKind, 'water'>, string> = {
  grass: 'grassSurface',
  sand: 'sandSurface',
  rock: 'rockSurface',
}

/** Default opacity per surface. Water alone is see-through. */
const DEFAULT_OPACITY: Record<SurfaceKind, number> = {
  grass: 1, sand: 1, rock: 1, water: 0.62,
}

/** Uniforms a caller may want to reach later, kept on `material.userData`. */
export interface SurfaceUniforms {
  uTime: { value: number }
  uOpacity: { value: number }
  uShallowColor: { value: THREE.Color }
  uFoamM: { value: number }
  uShallowM: { value: number }
  uMetresPerUnit: { value: number }
}

function makeUniforms(opacity: number): SurfaceUniforms {
  return {
    uTime: { value: 0 },
    uOpacity: { value: opacity },
    uShallowColor: { value: new THREE.Color(0.46, 0.66, 0.64) },
    uFoamM: { value: 3.2 },
    uShallowM: { value: 22 },
    uMetresPerUnit: { value: 1 },
  }
}

/**
 * Build the material for one ground layer.
 *
 * `transparent` + `depthWrite: false` is NOT a styling choice — it is the
 * contract every ground layer in this scene obeys. They are coplanar with the
 * basemap and with each other, centimetres apart, and a depth buffer at city
 * scale cannot separate them; the render order is what makes the stack
 * deterministic instead of a flicker that changes with the camera.
 */
export function createSurfaceMaterial(
  kind: SurfaceKind, opts: SurfaceMaterialOptions,
): THREE.MeshStandardMaterial {
  const uniforms = makeUniforms(opts.opacity ?? DEFAULT_OPACITY[kind])
  const water = kind === 'water'

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    metalness: 0,
    roughness: 1,
  })
  material.name = `surface-${kind}`
  material.userData.uniforms = uniforms
  material.userData.animated = water
  // Without this, three reuses one compiled program for every material that
  // looks alike — and all four of these look alike to the cache key.
  material.customProgramCacheKey = () => `surface-${kind}`

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    const v = vertexInjection(water)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${v.head}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${v.body}`)

    const declarations = /* glsl */ `
      uniform float uTime;
      uniform float uOpacity;
      uniform vec3 uShallowColor;
      uniform float uFoamM;
      uniform float uShallowM;
      varying vec2 vSurf;
      varying float vRough;
      ${water ? 'varying float vShore;' : ''}
      varying vec3 vTanX;
      varying vec3 vTanY;
      ${NOISE_GLSL}
      ${DETAIL_FADE_GLSL}
      ${SURFACE_FN_GLSL}
      ${water ? WATER_GLSL : ''}
    `

    let f = shader.fragmentShader.replace('#include <common>', `#include <common>\n${declarations}`)

    if (water) {
      f = replaceChunk(f, 'map_fragment', /* glsl */ `
        Water w = waterSurface(
          vSurf, uTime, vShore,
          #ifdef USE_COLOR
            vColor.rgb,
          #else
            vec3(0.17, 0.35, 0.48),
          #endif
          uShallowColor, uFoamM, uShallowM);
        diffuseColor.rgb = w.albedo;
      `)
      // The tone has already been consumed as the deep-water colour; letting
      // three multiply it in again would square it.
      f = replaceChunk(f, 'color_fragment', '')
      f = replaceChunk(f, 'roughnessmap_fragment', 'float roughnessFactor = w.roughness;')
      f = replaceChunk(f, 'normal_fragment_maps', /* glsl */ `
        normal = normalize(normal - w.grad.x * vTanX - w.grad.y * vTanY);
        // Fresnel decides how SEE-THROUGH the water is. The reflection itself
        // is three's — a smooth dielectric against the sky environment — which
        // is exactly the term a hand-written water shader always gets wrong.
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 5.0);
        diffuseColor.a = mix(uOpacity, 1.0, max(fres, w.foam));
      `)
    } else {
      f = replaceChunk(f, 'map_fragment', /* glsl */ `
        Surface surf = ${SURFACE_FN[kind]}(
          vSurf, vRough,
          #ifdef USE_COLOR
            vColor.rgb
          #else
            vec3(0.5)
          #endif
        );
        diffuseColor.rgb = surf.albedo;
        diffuseColor.a = uOpacity;
      `)
      f = replaceChunk(f, 'color_fragment', '')
      // `sheen` is how polished the surface is — wet rock and dry quartz sand
      // keep a highlight, grass has none — so it maps straight onto roughness.
      f = replaceChunk(f, 'roughnessmap_fragment',
        'float roughnessFactor = clamp(1.0 - surf.sheen * 1.6, 0.28, 1.0);')
      f = replaceChunk(f, 'normal_fragment_maps',
        'normal = normalize(normal - surf.grad.x * vTanX - surf.grad.y * vTanY);')
    }

    shader.fragmentShader = f
  }

  return material
}

// ── Foliage and bark ───────────────────────────────────────────────────────────

export interface FoliageOptions extends SurfaceMaterialOptions {
  /** 0 = flat colour, 1 = full leaf clumping. Bark uses a low value. */
  clump?: number
  /** Base colour, multiplied by the per-instance colour. */
  tint?: THREE.Color
}

/**
 * Tree canopies, and trunks with the clumping turned down.
 *
 * The clumping noise runs in OBJECT space, so every tree gets its own pattern
 * instead of one field sliding across the whole forest. Under PBR the canopy
 * also picks up sky light from above and bounce from the ground below, which is
 * most of what used to be faked with a hand-rolled hemispheric term.
 */
export function createFoliageMaterial(opts: FoliageOptions): THREE.MeshStandardMaterial {
  const clump = opts.clump ?? 1
  const material = new THREE.MeshStandardMaterial({
    color: opts.tint ?? new THREE.Color(1, 1, 1),
    metalness: 0,
    // Leaves are matte, bark more so. Nothing in a tree is polished.
    roughness: 0.92,
  })
  material.name = 'surface-foliage'
  material.customProgramCacheKey = () => `foliage-${clump.toFixed(2)}`

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uClump = { value: clump }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;')

    shader.fragmentShader = replaceChunk(
      shader.fragmentShader.replace('#include <common>', /* glsl */ `
        #include <common>
        uniform float uClump;
        varying vec3 vObj;
        ${NOISE_GLSL}
      `),
      'map_fragment', /* glsl */ `
        // The canopy geometry is a unit blob, so these frequencies are in
        // "crown widths" rather than metres.
        float masses = fbm(vObj.xy * 6.0 + vObj.z * 3.1, 3);
        float leaves = vnoise(vObj.xy * 26.0 + vObj.z * 11.0);
        float shade = 0.74 + 0.46 * masses;
        shade *= 0.93 + 0.14 * leaves;
        // Undersides of a crown are darker; tops catch the sky.
        shade *= 0.86 + 0.24 * clamp(vObj.z * 0.5 + 0.5, 0.0, 1.0);
        diffuseColor.rgb *= mix(1.0, shade, uClump);
      `,
    )
  }

  return material
}

// ── Terrain ────────────────────────────────────────────────────────────────────

export interface TerrainMaterialOptions extends SurfaceMaterialOptions {
  /** Metres per unit of patch-local geometry — the pattern's only scale. */
  metresPerUnit: number
}

/**
 * The relief patch, drawn with the same three material families blended per
 * vertex: vegetation low down, rock on the crags, snow on top.
 *
 * Two things make it different from a layer material.
 *
 * 1. Patch geometry is a PlaneGeometry centred on zero and about 1e-4 units
 *    wide, so — unlike the OSM layers, whose vertices are absolute mercator
 *    coordinates near 0.5 — it can read metres straight off `position` without
 *    falling off the float32 cliff. No `aSurf` attribute needed.
 * 2. `aGround.w` carries the SKY-VIEW FACTOR baked per vertex on the CPU. That
 *    is a real ambient-occlusion term and it is the one thing a fragment cannot
 *    work out for itself — it needs the horizon in every direction. It is fed
 *    into the indirect light, which is exactly what gives a valley floor its
 *    depth once the directional part is handled by real lighting.
 */
export function createTerrainMaterial(opts: TerrainMaterialOptions): THREE.MeshStandardMaterial {
  const uniforms = makeUniforms(1)
  uniforms.uMetresPerUnit.value = opts.metresPerUnit

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // The patch edge fades out into the flat basemap tiles, and that fade lives
    // in the vertex alpha.
    transparent: true,
    metalness: 0,
    roughness: 1,
  })
  material.name = 'surface-terrain'
  material.userData.uniforms = uniforms
  material.customProgramCacheKey = () => 'surface-terrain'

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        attribute vec4 aGround;
        uniform float uMetresPerUnit;
        varying vec4 vGround;
        varying vec2 vSurf;
        varying vec3 vTanX;
        varying vec3 vTanY;
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vSurf = position.xy * uMetresPerUnit;
        vGround = aGround;
        vTanX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
        vTanY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));
      `)

    let f = shader.fragmentShader.replace('#include <common>', /* glsl */ `
      #include <common>
      varying vec4 vGround;
      varying vec2 vSurf;
      varying vec3 vTanX;
      varying vec3 vTanY;
      ${NOISE_GLSL}
      ${DETAIL_FADE_GLSL}
      ${SURFACE_FN_GLSL}
    `)

    f = replaceChunk(f, 'map_fragment', /* glsl */ `
      float veg = vGround.x;
      float mineral = vGround.y;
      float snow = clamp(1.0 - veg - mineral, 0.0, 1.0);
      float beltRough = vGround.z;
      vec3 tone = vColor.rgb;

      vec3 groundAlbedo = vec3(0.0);
      vec2 groundGrad = vec2(0.0);
      float groundSheen = 0.0;
      // Skipping a family whose weight is nil keeps the cost of three materials
      // near the cost of one: a wavefront inside a forest never evaluates the
      // rock or the snow branch, and the belts are large and coherent on screen.
      if (veg > 0.004) {
        Surface s = grassSurface(vSurf, beltRough, tone);
        groundAlbedo += s.albedo * veg;
        groundGrad += s.grad * veg;
        groundSheen += s.sheen * veg;
      }
      if (mineral > 0.004) {
        Surface s = rockSurface(vSurf, beltRough, tone);
        groundAlbedo += s.albedo * mineral;
        groundGrad += s.grad * mineral;
        groundSheen += s.sheen * mineral;
      }
      if (snow > 0.004) {
        // Wind-packed snow is a granular surface the wind carves into regular
        // ripples — sastrugi. That is the sand family, not the rock one.
        Surface s = sandSurface(vSurf, beltRough, tone);
        groundAlbedo += s.albedo * snow;
        groundGrad += s.grad * snow;
        groundSheen += s.sheen * snow;
      }
      diffuseColor.rgb = groundAlbedo;
      diffuseColor.a = vColor.a;
    `)
    f = replaceChunk(f, 'color_fragment', '')
    f = replaceChunk(f, 'roughnessmap_fragment',
      'float roughnessFactor = clamp(1.0 - groundSheen * 1.6, 0.28, 1.0);')
    f = replaceChunk(f, 'normal_fragment_maps',
      'normal = normalize(normal - groundGrad.x * vTanX - groundGrad.y * vTanY);')
    // The sky-view factor, applied where an AO map would be.
    f = replaceChunk(f, 'aomap_fragment', /* glsl */ `
      reflectedLight.indirectDiffuse *= vGround.w;
      reflectedLight.indirectSpecular *= vGround.w;
    `)

    shader.fragmentShader = f
  }

  return material
}

// ── Live updates ───────────────────────────────────────────────────────────────

/** Advance the animated materials (water) to an absolute time in seconds. */
export function setSurfaceTime(root: THREE.Object3D, seconds: number): void {
  forEachSurfaceMaterial(root, (m) => {
    if (m.userData.animated) (m.userData.uniforms as SurfaceUniforms).uTime.value = seconds
  })
}

/** True when anything under `root` needs a per-frame uniform update. */
export function hasAnimatedMaterial(root: THREE.Object3D): boolean {
  let found = false
  forEachSurfaceMaterial(root, (m) => { if (m.userData.animated) found = true })
  return found
}

function forEachSurfaceMaterial(
  root: THREE.Object3D, fn: (m: THREE.Material) => void,
): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (m && m.userData && m.userData.uniforms) fn(m)
    }
  })
}
