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

/** Finite-difference gradient of fbm — the cheapest usable bump normal. */
vec2 fbmGrad(vec2 p, float eps, int octaves) {
  float c = fbm(p, octaves);
  return vec2(fbm(p + vec2(eps, 0.0), octaves) - c,
              fbm(p + vec2(0.0, eps), octaves) - c) / eps;
}

/** Ridged noise — the fracture lines that make rock read as rock. */
float ridge(vec2 p, int octaves) {
  return 1.0 - abs(fbm(p, octaves) * 2.0 - 1.0);
}
`

/**
 * One vertex shader for every ground surface.
 *
 * Lighting happens in WORLD space, which is the only frame where the camera
 * (fresnel, specular) and the layer's own sun can meet. The sun arrives in
 * layer-local coordinates and is rotated by the model matrix here, so it keeps
 * pointing the same way on the ground no matter how the placement is yawed.
 */
function vertexShader(water: boolean): string {
  return /* glsl */ `
    attribute vec2 aSurf;
    attribute float aRough;
    ${water ? 'attribute float aShore;' : ''}

    uniform vec3 uSunLocal;

    varying vec2 vSurf;
    varying float vRough;
    varying vec3 vTone;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    varying vec3 vSunW;
    varying vec3 vTanX;
    varying vec3 vTanY;
    varying vec3 vUpW;
    ${water ? 'varying float vShore;' : ''}

    #include <fog_pars_vertex>

    void main() {
      vSurf = aSurf;
      vRough = aRough;
      ${water ? 'vShore = aShore;' : ''}
      #ifdef USE_COLOR
        vTone = color;
      #else
        vTone = vec3(1.0);
      #endif

      mat3 m = mat3(modelMatrix);
      vNormalW = normalize(m * normal);
      vSunW    = normalize(m * uSunLocal);
      // Images of the layer's own axes: the frame a bump normal is perturbed in.
      vTanX = normalize(m * vec3(1.0, 0.0, 0.0));
      vTanY = normalize(m * vec3(0.0, 1.0, 0.0));
      vUpW  = normalize(m * vec3(0.0, 0.0, 1.0));

      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;

      #include <fog_vertex>
    }
  `
}

/** Declarations every ground fragment shader needs. */
const FRAGMENT_HEADER = /* glsl */ `
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform float uOpacity;

  varying vec2 vSurf;
  varying float vRough;
  varying vec3 vTone;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vSunW;
  varying vec3 vTanX;
  varying vec3 vTanY;
  varying vec3 vUpW;

  #include <fog_pars_fragment>
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

/**
 * Key light + hemispheric sky. Not physically based and not trying to be: the
 * job is to make slope and micro-relief legible in a screenshot, so the ambient
 * term stays high enough that nothing in shadow turns into a black hole.
 *
 * Used by the OSM ground layers. The terrain does NOT use it — its macro light
 * is baked per vertex on the CPU, which is the only place the sky-view factor
 * and the contour lines can be worked out.
 */
const LIGHTING_GLSL = /* glsl */ `
vec3 shade(vec3 albedo, vec3 n) {
  float key = max(dot(n, vSunW), 0.0);
  float sky = 0.5 + 0.5 * dot(n, vUpW);
  vec3 ambient = mix(uGroundColor, uSkyColor, sky);
  return albedo * (ambient + uSunColor * key);
}

/** Tilt a normal by a gradient expressed in the layer's own plane. */
vec3 perturb(vec3 n, vec2 grad, float strength) {
  return normalize(n - (grad.x * strength) * vTanX - (grad.y * strength) * vTanY);
}
`

/** Matches the built-in materials' output stage exactly — see meshbasic_frag. */
const OUTPUT_GLSL = /* glsl */ `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
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

// ── OSM ground layers ──────────────────────────────────────────────────────────

/**
 * Grass, sand and rock as standalone layer materials: pick the family, light it
 * with the layer's own sun. Water is separate — it is not a granular surface
 * and shares none of this.
 */
function groundFragment(surfaceFn: string): string {
  return /* glsl */ `
    ${FRAGMENT_HEADER}
    ${NOISE_GLSL}
    ${DETAIL_FADE_GLSL}
    ${LIGHTING_GLSL}
    ${SURFACE_FN_GLSL}

    void main() {
      Surface s = ${surfaceFn}(vSurf, vRough, vTone);
      vec3 n = perturb(normalize(vNormalW), s.grad, 1.0);
      vec3 lit = shade(s.albedo, n);
      if (s.sheen > 0.0) {
        vec3 halfway = normalize(normalize(cameraPosition - vWorld) + vSunW);
        lit += uSunColor * pow(max(dot(n, halfway), 0.0), 32.0) * s.sheen;
      }
      gl_FragColor = vec4(lit, uOpacity);

      ${OUTPUT_GLSL}
    }
  `
}

// ── Water ──────────────────────────────────────────────────────────────────────

/**
 * A river, lake or basin.
 *
 * Four things, together, are what separate water from a blue polygon:
 *   • fresnel — water is nearly a mirror at grazing angles and nearly clear
 *     looking straight down. Get this wrong and nothing else rescues it.
 *   • moving normals — two scrolling noise layers, coarse swell over fine chop.
 *   • the sun's glitter path, which is the single most recognisable thing on
 *     any body of water.
 *   • the shore. Shallows go pale as the bed comes up, and there is a foam
 *     fringe against the bank. `aShore` (metres to the outline, computed on the
 *     CPU) is what makes both possible; a polygon triangulated the plain way
 *     has no interior and cannot know where its own edge is.
 */
const WATER_FRAGMENT = /* glsl */ `
  ${FRAGMENT_HEADER}
  ${NOISE_GLSL}
  ${DETAIL_FADE_GLSL}
  ${LIGHTING_GLSL}

  uniform float uTime;
  uniform vec3 uShallowColor;
  uniform vec3 uSkyReflect;
  uniform float uFoamM;
  uniform float uShallowM;

  varying float vShore;

  void main() {
    // Swell and chop travel in different directions at different speeds; a
    // single scrolling layer reads as a sliding texture, two read as water.
    float swellF = 0.085;      // ~12 m crests
    float chopF  = 0.42;       // ~2.4 m
    vec2 swell = vSurf * swellF + vec2(uTime * 0.36, uTime * 0.14);
    vec2 chop  = vSurf * chopF  - vec2(uTime * 0.19, uTime * 0.44);

    vec2 grad = fbmGrad(swell, 0.25, 3) * (0.55 * detailFade(vSurf, swellF))
              + fbmGrad(chop,  0.25, 2) * (0.22 * detailFade(vSurf, chopF));
    vec3 n = perturb(normalize(vNormalW), grad, 1.1);

    vec3 view = normalize(cameraPosition - vWorld);
    float facing = max(dot(n, view), 0.0);
    // Schlick, with a floor so water seen from directly above still reflects.
    float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);

    // Depth from the bank. Not measured — OSM carries no bathymetry — but
    // "shallower at the edge" is true of every natural body of water.
    float depth = clamp(vShore / uShallowM, 0.0, 1.0);
    vec3 body = mix(uShallowColor, vTone, smoothstep(0.0, 1.0, depth));

    // The bed showing through the shallows, and the sky on the surface.
    vec3 col = mix(body, uSkyReflect, fresnel * 0.85);
    col += uSunColor * pow(max(dot(n, normalize(view + vSunW)), 0.0), 180.0) * 0.9;
    col *= 0.85 + 0.30 * max(dot(n, vUpW), 0.0);

    // Foam against the bank, torn up by noise and drifting, so the line is
    // ragged the way surf is rather than a clean offset outline.
    float fringe = fbm(vSurf * 0.9 + vec2(uTime * 0.06, -uTime * 0.04), 3);
    float foamEdge = uFoamM * (0.45 + 1.1 * fringe);
    float foam = 1.0 - smoothstep(0.0, foamEdge, vShore);
    foam *= 0.55 + 0.45 * fbm(vSurf * 2.6 - vec2(uTime * 0.09), 2);
    foam = clamp(foam, 0.0, 1.0);
    col = mix(col, vec3(0.92, 0.95, 0.96), foam * 0.85);

    // Opaque where it reflects, clearer where you can see into it — and always
    // opaque in the foam.
    float alpha = mix(uOpacity, min(1.0, uOpacity + 0.28), fresnel);
    alpha = mix(alpha, 1.0, foam * 0.8);

    gl_FragColor = vec4(col, alpha);

    ${OUTPUT_GLSL}
  }
`

// ── Factory ────────────────────────────────────────────────────────────────────

const FRAGMENT_BY_KIND: Record<SurfaceKind, string> = {
  grass: groundFragment('grassSurface'),
  sand: groundFragment('sandSurface'),
  rock: groundFragment('rockSurface'),
  water: WATER_FRAGMENT,
}

/** Default opacity per surface. Water alone is see-through. */
const DEFAULT_OPACITY: Record<SurfaceKind, number> = {
  grass: 1, sand: 1, rock: 1, water: 0.66,
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
): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunLocal:  { value: new THREE.Vector3() },
      uSunColor:  { value: new THREE.Color(0.78, 0.74, 0.66) },
      uSkyColor:  { value: new THREE.Color(0.40, 0.45, 0.54) },
      uGroundColor: { value: new THREE.Color(0.20, 0.19, 0.17) },
      uOpacity:   { value: opts.opacity ?? DEFAULT_OPACITY[kind] },
      uTime:      { value: 0 },
      uShallowColor: { value: new THREE.Color(0.42, 0.62, 0.62) },
      uSkyReflect:   { value: new THREE.Color(0.52, 0.63, 0.78) },
      uFoamM:        { value: 3.2 },
      uShallowM:     { value: 22 },
    },
  ])
  uniforms.uSunLocal.value = sunDirectionLocal(opts.sun)

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vertexShader(kind === 'water'),
    fragmentShader: FRAGMENT_BY_KIND[kind],
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  })
  material.name = `surface-${kind}`
  // Marks the materials the render loop has to advance. Only water animates,
  // but the flag lives on all of them so the caller never has to know which.
  material.userData.animated = kind === 'water'
  return material
}

// ── Foliage and bark ───────────────────────────────────────────────────────────

/**
 * Tree canopies.
 *
 * Unlit cones next to a properly shaded lawn look worse than both did before,
 * so the trees have to join the same lighting. Two things beyond plain diffuse
 * earn their cost here: a clumping noise in OBJECT space, which breaks the cone
 * silhouette into masses of leaves, and a transmission term — a canopy lit from
 * behind GLOWS, and that single cue does more for "these are trees" than any
 * amount of geometry would.
 */
const FOLIAGE_VERTEX = /* glsl */ `
  uniform vec3 uSunLocal;

  varying vec3 vObj;
  varying vec3 vTone;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vSunW;

  #include <fog_pars_vertex>

  void main() {
    vec3 transformed = position;
    vec3 objectNormal = normal;

    #ifdef USE_INSTANCING
      mat4 im = instanceMatrix;
      transformed = (im * vec4(position, 1.0)).xyz;
      // Instance scales are non-uniform (a tall thin crown), so the normal is
      // approximate. At canopy scale that is invisible, and the exact inverse
      // transpose per instance is not worth a mat3 inverse per vertex.
      objectNormal = normalize(mat3(im) * normal);
    #endif

    // Noise coordinates: the vertex in the tree's OWN space, so every tree gets
    // its own clumping instead of a pattern sliding across the whole forest.
    vObj = position;

    #ifdef USE_INSTANCING_COLOR
      vTone = instanceColor;
    #elif defined( USE_COLOR )
      vTone = color;
    #else
      vTone = vec3(1.0);
    #endif

    mat3 m = mat3(modelMatrix);
    vNormalW = normalize(m * objectNormal);
    vSunW = normalize(m * uSunLocal);

    vec4 wp = modelMatrix * vec4(transformed, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const FOLIAGE_FRAGMENT = /* glsl */ `
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;
  uniform vec3 uTint;
  uniform float uClump;
  uniform float uTransmission;

  varying vec3 vObj;
  varying vec3 vTone;
  varying vec3 vNormalW;
  varying vec3 vWorld;
  varying vec3 vSunW;

  #include <fog_pars_fragment>
  ${NOISE_GLSL}

  void main() {
    vec3 n = normalize(vNormalW);

    // Leaf masses. The canopy geometry is a unit blob, so object coordinates
    // are ~1 across and the frequencies here are in "crown widths".
    float masses = fbm(vObj.xy * 6.0 + vObj.z * 3.1, 3);
    float leaves = vnoise(vObj.xy * 26.0 + vObj.z * 11.0);

    // Instanced canopies carry their colour per instance; trunks and anything
    // uninstanced take it from the tint uniform instead.
    vec3 base = vTone * uTint;

    vec3 albedo = base * (0.74 + 0.46 * masses);
    albedo *= 0.93 + 0.14 * leaves;
    // Undersides of a crown are darker; tops catch the sky.
    albedo *= 0.86 + 0.24 * clamp(vObj.z * 0.5 + 0.5, 0.0, 1.0);
    albedo = mix(base, albedo, uClump);

    float key = max(dot(n, vSunW), 0.0);
    float sky = 0.5 + 0.5 * n.y;
    vec3 ambient = mix(uGroundColor, uSkyColor, sky);

    // Backlit leaves: light coming through the far side of the crown.
    vec3 view = normalize(cameraPosition - vWorld);
    float through = pow(max(dot(-view, vSunW), 0.0), 3.0) * max(0.0, 1.0 - key);
    vec3 lit = albedo * (ambient + uSunColor * key)
             + base * uSunColor * through * uTransmission;

    gl_FragColor = vec4(lit, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export interface FoliageOptions extends SurfaceMaterialOptions {
  /** 0 = flat colour, 1 = full leaf clumping. Bark uses a low value. */
  clump?: number
  /** Strength of the backlit glow. Bark has none. */
  transmission?: number
  /** Multiplied into the vertex/instance colour — how trunks get their brown. */
  tint?: THREE.Color
}

/** Canopy material — also used, with clump/transmission near zero, for trunks. */
export function createFoliageMaterial(opts: FoliageOptions): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunLocal: { value: new THREE.Vector3() },
      uSunColor: { value: new THREE.Color(0.80, 0.76, 0.66) },
      uSkyColor: { value: new THREE.Color(0.42, 0.48, 0.58) },
      uGroundColor: { value: new THREE.Color(0.18, 0.19, 0.16) },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uClump: { value: opts.clump ?? 1 },
      uTransmission: { value: opts.transmission ?? 0.45 },
    },
  ])
  uniforms.uSunLocal.value = sunDirectionLocal(opts.sun)
  if (opts.tint) (uniforms.uTint.value as THREE.Color).copy(opts.tint)

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FOLIAGE_VERTEX,
    fragmentShader: FOLIAGE_FRAGMENT,
    fog: true,
  })
  material.name = 'surface-foliage'
  return material
}

// ── Terrain ────────────────────────────────────────────────────────────────────

/**
 * The relief patch itself, drawn with the same three material families blended
 * per vertex: vegetation low down, rock on the crags, snow on top.
 *
 * TWO THINGS MAKE THIS DIFFERENT FROM THE LAYER MATERIALS.
 *
 * 1. The macro light is NOT computed here. It arrives baked per vertex, because
 *    the CPU is the only place that can work out the multi-directional
 *    hillshade, the sky-view factor (which is what gives a valley floor its
 *    depth) and the contour lines. The shader contributes only MICRO relief, as
 *    a ratio against the unperturbed normal, so the two never double-shade.
 *
 * 2. Patch geometry is a PlaneGeometry centred on zero and about 1e-4 units
 *    wide, so — unlike the OSM layers, whose vertices are absolute mercator
 *    coordinates near 0.5 — it can read metres straight off `position` without
 *    falling off the float32 cliff. No `aSurf` attribute needed.
 */
const TERRAIN_VERTEX = /* glsl */ `
  attribute vec4 aGround;
  uniform float uMetresPerUnit;

  varying vec2 vSurf;
  varying vec3 vNormalL;
  varying vec4 vGround;
  varying vec3 vTone;
  varying float vAlpha;

  #include <fog_pars_vertex>

  void main() {
    vSurf = position.xy * uMetresPerUnit;
    // Lighting stays in the patch's OWN frame (x east, y north, z up), which
    // sidesteps the vertical exaggeration: mesh.scale.z is non-uniform, so a
    // world-space normal would be wrong exactly when the relief is stretched.
    vNormalL = normal;
    vGround = aGround;

    #if defined( USE_COLOR_ALPHA )
      vTone = color.rgb;
      vAlpha = color.a;
    #elif defined( USE_COLOR )
      vTone = color;
      vAlpha = 1.0;
    #else
      vTone = vec3(0.5);
      vAlpha = 1.0;
    #endif

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const TERRAIN_FRAGMENT = /* glsl */ `
  uniform vec3 uSunLocal;

  varying vec2 vSurf;
  varying vec3 vNormalL;
  varying vec4 vGround;
  varying vec3 vTone;
  varying float vAlpha;

  #include <fog_pars_fragment>
  ${NOISE_GLSL}
  ${DETAIL_FADE_GLSL}
  ${SURFACE_FN_GLSL}

  void main() {
    float veg = vGround.x;
    float mineral = vGround.y;
    float snow = clamp(1.0 - veg - mineral, 0.0, 1.0);
    float rough = vGround.z;

    vec3 albedo = vec3(0.0);
    vec2 grad = vec2(0.0);

    // Skipping a family whose weight is nil keeps the cost of three materials
    // near the cost of one: a wavefront inside a forest never evaluates the
    // rock or the snow branch, and the belts are large and coherent on screen.
    if (veg > 0.004) {
      Surface s = grassSurface(vSurf, rough, vTone);
      albedo += s.albedo * veg;
      grad += s.grad * veg;
    }
    if (mineral > 0.004) {
      Surface s = rockSurface(vSurf, rough, vTone);
      albedo += s.albedo * mineral;
      grad += s.grad * mineral;
    }
    if (snow > 0.004) {
      // Wind-packed snow is a granular surface the wind carves into regular
      // ripples — sastrugi. That is the sand family, not the rock one.
      Surface s = sandSurface(vSurf, rough, vTone);
      albedo += s.albedo * snow;
      grad += s.grad * snow;
    }

    vec3 nL = normalize(vNormalL);
    vec3 nP = normalize(nL - vec3(grad, 0.0));
    float lit = max(dot(nP, uSunLocal), 0.0);
    float flatLit = max(dot(nL, uSunLocal), 0.0);
    float micro = clamp(1.0 + (lit - flatLit) * 1.5, 0.45, 1.75);

    gl_FragColor = vec4(albedo * vGround.w * micro, vAlpha);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

export interface TerrainMaterialOptions extends SurfaceMaterialOptions {
  /** Metres per unit of patch-local geometry — the pattern's only scale. */
  metresPerUnit: number
}

/**
 * Material for the terrain patch. Expects a `vec4 aGround` attribute carrying
 * (vegetation, mineral, roughness, baked light) per vertex, and the usual RGBA
 * vertex colour where RGB is the belt tone and A is the patch edge fade.
 */
export function createTerrainMaterial(opts: TerrainMaterialOptions): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunLocal: { value: new THREE.Vector3() },
      uMetresPerUnit: { value: 1 },
    },
  ])
  uniforms.uSunLocal.value = sunDirectionLocal(opts.sun)
  uniforms.uMetresPerUnit.value = opts.metresPerUnit

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: TERRAIN_VERTEX,
    fragmentShader: TERRAIN_FRAGMENT,
    vertexColors: true,
    // Same as the MeshBasicMaterial it replaces: the patch edge fades out into
    // the flat basemap tiles, and that fade lives in the vertex alpha.
    transparent: true,
    fog: true,
  })
  material.name = 'surface-terrain'
  return material
}

// ── Live updates ───────────────────────────────────────────────────────────────

/**
 * Re-aim the sun on every procedural material under an object. Called when the
 * relief light moves, so the whole scene turns together instead of the terrain
 * hillshade drifting away from the surfaces standing on it.
 */
export function applySurfaceSun(root: THREE.Object3D, sun: SurfaceSun): void {
  const dir = sunDirectionLocal(sun)
  forEachShaderMaterial(root, (m) => {
    const u = m.uniforms.uSunLocal
    if (u) (u.value as THREE.Vector3).copy(dir)
  })
}

/**
 * Re-aim one material directly. Needed where the material is held but not
 * currently attached to anything — a detached material never gets traversed,
 * and would come back with a stale sun when it is put back on.
 */
export function setMaterialSun(material: THREE.ShaderMaterial, sun: SurfaceSun): void {
  const u = material.uniforms.uSunLocal
  if (u) (u.value as THREE.Vector3).copy(sunDirectionLocal(sun))
}

/** Advance the animated materials (water) to an absolute time in seconds. */
export function setSurfaceTime(root: THREE.Object3D, seconds: number): void {
  forEachShaderMaterial(root, (m) => {
    if (m.userData.animated && m.uniforms.uTime) m.uniforms.uTime.value = seconds
  })
}

/** True when anything under `root` needs a per-frame uniform update. */
export function hasAnimatedMaterial(root: THREE.Object3D): boolean {
  let found = false
  forEachShaderMaterial(root, (m) => { if (m.userData.animated) found = true })
  return found
}

function forEachShaderMaterial(
  root: THREE.Object3D, fn: (m: THREE.ShaderMaterial) => void,
): void {
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (m instanceof THREE.ShaderMaterial) fn(m)
    }
  })
}
