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
 * Key light + hemispheric sky. Not physically based and not trying to be: the
 * job is to make slope and micro-relief legible in a screenshot, so the ambient
 * term stays high enough that nothing in shadow turns into a black hole.
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

// ── Grass ──────────────────────────────────────────────────────────────────────

/**
 * Lawn, meadow, forest floor — whatever the tagged tone says it is.
 *
 * Three scales stacked, because that is what a real sward has: metre-wide
 * patches where the ground is drier or has been mown differently, tuft-scale
 * clumping, and a fine breakup that stops the surface going glassy up close.
 * The tuft layer also drives the normal, which is what makes a park catch the
 * light unevenly instead of reading as painted cardboard.
 */
const GRASS_FRAGMENT = /* glsl */ `
  ${FRAGMENT_HEADER}
  ${NOISE_GLSL}
  ${LIGHTING_GLSL}

  void main() {
    // Metre-scale patchiness: mowing, wear, drainage.
    float patch = fbm(vSurf * 0.09, 4);
    // Tufts. `vRough` carries how coarse the vegetation is — a mown pitch is
    // smooth, heath and scrub are shaggy.
    float tuftScale = mix(2.2, 5.5, vRough);
    vec2 grad = fbmGrad(vSurf * tuftScale, 0.35, 2);
    float tuft = fbm(vSurf * tuftScale, 2);
    float fine = vnoise(vSurf * 22.0);

    // Dry grass is yellower and lighter; shade between tufts is darker and
    // slightly bluer. Both are small moves — a park is still green.
    vec3 dry = vTone * vec3(1.30, 1.16, 0.72);
    vec3 albedo = mix(vTone, dry, smoothstep(0.45, 0.85, patch) * 0.55);
    albedo *= 0.80 + 0.34 * tuft;
    albedo *= 0.95 + 0.10 * fine;

    vec3 n = perturb(normalize(vNormalW), grad, mix(0.05, 0.16, vRough));
    // Self-shadowing between blades: the gaps never see the full sky.
    float occl = 0.82 + 0.18 * tuft;
    gl_FragColor = vec4(shade(albedo, n) * occl, uOpacity);

    ${OUTPUT_GLSL}
  }
`

// ── Sand ───────────────────────────────────────────────────────────────────────

/**
 * Beach, dune, shingle, mud.
 *
 * The ripples are the whole point. Flat sand-coloured polygons read as paper;
 * what says "sand" from any angle is the regular wind or wave ripple, one
 * dominant direction, bent by larger drifts. Wavelength scales with `vRough`
 * so a fine beach gets centimetre ripples and a dune field gets metre ones,
 * and shingle drops the ripples for pebble-scale lumps instead.
 */
const SAND_FRAGMENT = /* glsl */ `
  ${FRAGMENT_HEADER}
  ${NOISE_GLSL}
  ${LIGHTING_GLSL}

  void main() {
    // Large drifts: where the surface piles up and where it is scoured.
    float drift = fbm(vSurf * 0.06, 4);

    // Ripple direction, bent by the drift so the crests are never dead straight.
    float bearing = 0.9 + drift * 1.4;
    vec2 dir = vec2(cos(bearing), sin(bearing));
    float wavelength = mix(0.45, 3.2, vRough);
    float phase = dot(vSurf, dir) * (6.2831853 / wavelength) + fbm(vSurf * 0.35, 3) * 5.0;
    // Sharper than a sine: wind ripples have flat troughs and crisp crests.
    float ripple = pow(0.5 + 0.5 * sin(phase), 1.6);
    // Shingle (high roughness) trades ripples for pebbles.
    float pebble = vnoise(vSurf * mix(9.0, 3.0, vRough));
    float rippleMix = 1.0 - smoothstep(0.55, 0.9, vRough);

    // Grain. Fine enough that it reads as texture rather than as noise, and it
    // is what keeps sand from going plastic in a close-up screenshot.
    float grain = vnoise(vSurf * 130.0) * 0.5 + vnoise(vSurf * 47.0) * 0.5;

    vec3 albedo = vTone;
    albedo *= 0.88 + 0.20 * mix(pebble, ripple, rippleMix);
    albedo *= 0.93 + 0.16 * drift;
    albedo *= 0.94 + 0.12 * grain;

    // Normal from the ripple crests plus the grain, so the low sun rakes across
    // them the way it does on a real beach.
    vec2 rippleGrad = dir * cos(phase) * (6.2831853 / wavelength) * 0.5 * rippleMix;
    vec2 grainGrad = fbmGrad(vSurf * 30.0, 0.02, 2) * 0.35;
    vec3 n = perturb(normalize(vNormalW), rippleGrad * 0.09 + grainGrad, 0.55);

    vec3 lit = shade(albedo, n);

    // Dry quartz sand has a real sheen at grazing angles — subtle, warm, and
    // the reason a beach goes bright silver when you look towards the sun.
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 halfway = normalize(view + vSunW);
    float sheen = pow(max(dot(n, halfway), 0.0), 22.0) * (0.16 * (1.0 - vRough));
    lit += uSunColor * sheen;

    gl_FragColor = vec4(lit, uOpacity);

    ${OUTPUT_GLSL}
  }
`

// ── Rock ───────────────────────────────────────────────────────────────────────

/**
 * Bare rock, scree, glacier — the ground a site in the mountains actually sits
 * on. Ridged noise gives the fracture pattern; `vRough` moves it from smooth
 * ice (no fractures, faint sparkle) through slabbed rock to loose scree.
 */
const ROCK_FRAGMENT = /* glsl */ `
  ${FRAGMENT_HEADER}
  ${NOISE_GLSL}
  ${LIGHTING_GLSL}

  void main() {
    float bed = fbm(vSurf * 0.05, 4);
    float fracture = ridge(vSurf * 0.55, 3);
    float blocks = ridge(vSurf * mix(1.6, 5.0, vRough), 2);
    float grit = vnoise(vSurf * 26.0);

    // Crevices are darker and less saturated — dirt and shadow collect in them.
    float crev = smoothstep(0.55, 0.95, mix(fracture, blocks, 0.6));
    vec3 albedo = vTone * (0.82 + 0.28 * bed);
    albedo = mix(albedo, albedo * vec3(0.62, 0.60, 0.60), crev * mix(0.35, 0.75, vRough));
    albedo *= 0.94 + 0.12 * grit;

    vec2 grad = fbmGrad(vSurf * mix(1.2, 4.0, vRough), 0.12, 3);
    vec3 n = perturb(normalize(vNormalW), grad, mix(0.30, 0.85, vRough));

    vec3 lit = shade(albedo, n);

    // Wet-looking ice keeps a tight highlight; dry rock barely has one.
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 halfway = normalize(view + vSunW);
    float gloss = (1.0 - vRough) * 0.35;
    lit += uSunColor * pow(max(dot(n, halfway), 0.0), 60.0) * gloss;

    gl_FragColor = vec4(lit, uOpacity);

    ${OUTPUT_GLSL}
  }
`

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
 *   • the shore. Shallows go pale and warm as the bed comes up, and there is a
 *     foam fringe against the bank. `aShore` (metres to the outline, computed
 *     on the CPU) is what makes both possible; a polygon triangulated the plain
 *     way has no interior and cannot know where its own edge is.
 */
const WATER_FRAGMENT = /* glsl */ `
  ${FRAGMENT_HEADER}
  ${NOISE_GLSL}
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
    vec2 swell = vSurf * 0.085 + vec2(uTime * 0.055, uTime * 0.021);
    vec2 chop  = vSurf * 0.42  - vec2(uTime * 0.031, uTime * 0.074);

    vec2 grad = fbmGrad(swell, 0.35, 3) * 0.55 + fbmGrad(chop, 0.10, 2) * 0.22;
    vec3 n = perturb(normalize(vNormalW), grad, 1.1);

    vec3 view = normalize(cameraPosition - vWorld);
    float facing = max(dot(n, view), 0.0);
    // Schlick, with a floor so water seen from directly above still reflects.
    float fresnel = 0.03 + 0.97 * pow(1.0 - facing, 5.0);

    // Depth from the bank. Not measured — OSM does not carry bathymetry — but
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
  grass: GRASS_FRAGMENT,
  sand: SAND_FRAGMENT,
  rock: ROCK_FRAGMENT,
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

    vec3 albedo = vTone * (0.74 + 0.46 * masses);
    albedo *= 0.93 + 0.14 * leaves;
    // Undersides of a crown are darker; tops catch the sky.
    albedo *= 0.86 + 0.24 * clamp(vObj.z * 0.5 + 0.5, 0.0, 1.0);
    albedo = mix(vTone, albedo, uClump);

    float key = max(dot(n, vSunW), 0.0);
    float sky = 0.5 + 0.5 * n.y;
    vec3 ambient = mix(uGroundColor, uSkyColor, sky);

    // Backlit leaves: light coming through the far side of the crown.
    vec3 view = normalize(cameraPosition - vWorld);
    float through = pow(max(dot(-view, vSunW), 0.0), 3.0) * max(0.0, 1.0 - key);
    vec3 lit = albedo * (ambient + uSunColor * key)
             + vTone * uSunColor * through * uTransmission;

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
      uClump: { value: opts.clump ?? 1 },
      uTransmission: { value: opts.transmission ?? 0.45 },
    },
  ])
  uniforms.uSunLocal.value = sunDirectionLocal(opts.sun)

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FOLIAGE_VERTEX,
    fragmentShader: FOLIAGE_FRAGMENT,
    fog: true,
  })
  material.name = 'surface-foliage'
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

/** Advance the animated materials (water) to an absolute time in seconds. */
export function setSurfaceTime(root: THREE.Object3D, seconds: number): void {
  forEachShaderMaterial(root, (m) => {
    if (m.userData.animated && m.uniforms.uTime) m.uniforms.uTime.value = seconds
  })
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
