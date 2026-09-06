// ─── surface-shaders ──────────────────────────────────────────────────────────
// Procedural materials for the ground layers: grass, sand, rock, water — plus
// foliage and bark, so the trees standing on them are lit by the same sun.
//
// SPLIT BY SCALE. Coarse variation (8-30 m) is evaluated procedurally: those
// wavelengths cannot repeat inside one site and cannot alias, and they carry the
// information — mowing, wear, drift, bedding. Fine detail comes from a baked
// tileable map (surface-textures) sampled with hex-tiling, because that is where
// the cost and the aliasing were, and mipmaps solve both properly. No image
// files are downloaded: the map is baked at runtime from the same noise.
//
// THESE ARE REAL PBR MATERIALS. MeshStandardMaterial extended through
// onBeforeCompile, not a hand-written ShaderMaterial. Feeding procedural values
// into three's own shader keeps energy-conserving specular, image-based lighting
// from the sky environment, received shadows, fog and tone mapping — every one
// of which a hand-rolled material reimplements badly or not at all.
//
// COORDINATES — the one thing that must not be got wrong.
// Layer geometry lives in NORMALIZED web-mercator units under a geoRoot scaled
// by ~4e7. A vertex is a number like 0.5065432 with a metre worth about 4e-8 of
// it, which is barely above float32 resolution: noise sampled from `position`
// would come out in ~1.5 m blocks. Every material here reads its pattern from
// `aSurf` instead — planar METRES relative to the layer origin, computed in
// double precision on the CPU. Nothing procedural may use `position`.

import * as THREE from 'three'
import { surfaceTexture, TILE_M, type TextureFamily } from './surface-textures'

/** The surfaces we can draw procedurally. */
export type SurfaceKind = 'grass' | 'sand' | 'rock' | 'water' | 'asphalt'

export interface SurfaceSun {
  /** Bearing the light comes FROM, degrees clockwise from north. */
  azimuthDeg: number
  /** Height above the horizon, degrees. */
  altitudeDeg: number
}

export interface SurfaceMaterialOptions {
  /**
   * Kept for callers that still pass it, and ignored: these are PBR materials
   * now and their light comes from the scene and the sky environment. The type
   * survives because facade-shader is still self-lit and shares it.
   */
  sun?: SurfaceSun
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

/**
 * A noise layer AND its gradient, sharing the centre sample: three evaluations
 * instead of four. Only water needs it now — the granular families take their
 * fine detail from a baked map instead.
 */
vec3 fbmAndGrad(vec2 p, float eps, int octaves) {
  float c = fbm(p, octaves);
  return vec3(
    c,
    (fbm(p + vec2(eps, 0.0), octaves) - c) / eps,
    (fbm(p + vec2(0.0, eps), octaves) - c) / eps
  );
}
`

/**
 * Hex-tiling: sampling a tileable map so it never visibly repeats.
 *
 * A seamless tile still repeats — at ground scale the eye picks the pattern out
 * within two or three tiles, and that is the single biggest tell that a surface
 * is textured rather than real. Mikkelsen's hex-tiling (Practical Real-Time
 * Hex-Tiling, JCGT 2022, after Heitz & Neyret) lays a triangular lattice over
 * the UVs, gives every hexagonal cell its own random offset into the map, and
 * blends the three cells nearest the fragment.
 *
 * Two details are what make it work rather than look like a smudge:
 *
 *   • textureGrad with EXPLICIT derivatives. The UV jumps between cells, and
 *     automatic mip selection reads that jump as an enormous gradient and picks
 *     the blurriest mip — the surface turns to fog exactly at the cell seams.
 *   • variance-preserving blending. Averaging three offset samples averages the
 *     contrast away too; rescaling around the map's mean puts it back.
 *
 * textureGrad is core in GLSL ES 3.00, which is what three compiles to on
 * WebGL2 — the only context this viewer runs in.
 */
const HEX_TILE_GLSL = /* glsl */ `
vec2 hexHash(vec2 p) {
  vec2 r = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(r) * 43758.5453);
}

void triangleGrid(vec2 uv, out vec3 w, out vec2 v1, out vec2 v2, out vec2 v3) {
  uv *= 3.4641016;                                  // 2 * sqrt(3)
  vec2 s = mat2(1.0, 0.0, -0.5773503, 1.1547005) * uv;
  vec2 base = floor(s);
  vec3 t = vec3(fract(s), 0.0);
  t.z = 1.0 - t.x - t.y;
  if (t.z > 0.0) {
    w = vec3(t.z, t.y, t.x);
    v1 = base;
    v2 = base + vec2(0.0, 1.0);
    v3 = base + vec2(1.0, 0.0);
  } else {
    w = vec3(-t.z, 1.0 - t.y, 1.0 - t.x);
    v1 = base + vec2(1.0, 1.0);
    v2 = base + vec2(1.0, 0.0);
    v3 = base + vec2(0.0, 1.0);
  }
}

vec4 hexSample(sampler2D map, vec2 uv) {
  vec2 dx = dFdx(uv);
  vec2 dy = dFdy(uv);

  // Once a pixel covers a good fraction of a tile, every hex cell resolves to
  // the same mip level and the same mean, so the three fetches all return the
  // same answer. Taking one instead is not an approximation — the mip pyramid
  // has already done the blending. It matters because the expensive frames are
  // exactly the distant ones, where the terrain fills the screen.
  //
  // The branch is safe here only because textureGrad carries its own explicit
  // derivatives; a plain texture() in non-uniform control flow would be
  // undefined. And the footprint varies smoothly across the screen, so the
  // branch stays coherent within a wavefront.
  if (max(length(dx), length(dy)) > 0.28) return textureGrad(map, uv, dx, dy);

  vec3 w;
  vec2 v1, v2, v3;
  triangleGrid(uv, w, v1, v2, v3);
  vec4 c1 = textureGrad(map, uv + hexHash(v1), dx, dy);
  vec4 c2 = textureGrad(map, uv + hexHash(v2), dx, dy);
  vec4 c3 = textureGrad(map, uv + hexHash(v3), dx, dy);

  // Sharpen so one cell usually dominates; a soft blend is what smears detail.
  w = w * w * w;
  w /= (w.x + w.y + w.z);

  vec4 blended = w.x * c1 + w.y * c2 + w.z * c3;
  // Normal XY and albedo are centred on 0.5 by construction, so that is the
  // mean to rescale around. Roughness is left linear: restoring its variance
  // would push it outside [0,1] at cell centres.
  float gain = inversesqrt(dot(w, w));
  vec4 centre = vec4(0.5, 0.5, blended.b, 0.5);
  return (blended - centre) * gain + centre;
}
`

// ── The surfaces themselves ────────────────────────────────────────────────────

/**
 * Three material families, as plain functions of a planar position in METRES.
 *
 * Each is split by SCALE, and the split is the whole design:
 *
 *   • COARSE (8–30 m) stays procedural. Wavelengths that long cannot repeat
 *     inside one site and cannot alias, and this is where the information lives
 *     — mowing, wear, drift, bedding. Two fbm calls.
 *   • FINE (under a few metres) comes from the baked detail map. This is where
 *     all the cost and all the aliasing used to be, and it is exactly what
 *     mipmaps and anisotropic filtering are for.
 *
 * They are functions rather than whole shaders because the terrain BLENDS them —
 * a mountainside is grass low down, rock on the crags and snow on top, and that
 * boundary has to be a gradient rather than a seam. The standalone layer
 * materials are thin wrappers around the same code, so a park and the hillside
 * behind it are literally the same grass.
 */
const SURFACE_FN_GLSL = /* glsl */ `
struct Surface {
  vec3 albedo;
  vec2 grad;
  float roughness;
};

/** Unpack a detail sample into a slope and a roughness. */
vec2 detailSlope(vec4 d, float strength) {
  return (d.rg - 0.5) * -2.0 * strength;
}

/**
 * Lawn, meadow, forest floor. \`rough\` moves it from a mown pitch to heath and
 * scrub — it drives the grain SIZE, which is what actually distinguishes them.
 */
Surface grassSurface(sampler2D grassMap, sampler2D shrubMap, vec2 p, float rough, vec3 tone) {
  float meadow = fbm(p * 0.035, 3);          // 30 m — drainage, aspect, mowing
  float wear   = fbm(p * 0.13, 3);           // 8 m  — paths, bare patches

  // Dry grass is yellower and lighter. A small move — a park is still green.
  vec3 dry = tone * vec3(1.34, 1.18, 0.70);
  vec3 albedo = mix(tone, dry, smoothstep(0.38, 0.80, meadow) * 0.5);
  albedo *= 0.80 + 0.42 * wear;

  // OSM already says whether this is a mown pitch or a scrub hillside, and it
  // arrives as the rough parameter. They are not the same surface at any grain
  // size — one is dense and fine, the other lumpy with real gaps between bushes —
  // so they get different maps and are blended across the middle.
  float bushy = smoothstep(0.52, 0.84, rough);

  vec4 d = vec4(0.5, 0.5, 0.9, 0.5);
  vec2 slope = vec2(0.0);
  if (bushy < 0.996) {
    vec4 g = hexSample(grassMap, p / mix(1.5, 3.4, rough));
    d = mix(g, d, bushy);
    slope += detailSlope(g, mix(0.55, 0.85, rough)) * (1.0 - bushy);
  }
  if (bushy > 0.004) {
    // Bushes are bigger than tufts, so the same map is stretched further.
    vec4 b = hexSample(shrubMap, p / mix(3.0, 6.5, rough));
    d = mix(d, b, bushy);
    slope += detailSlope(b, 1.15) * bushy;
    // Shade collects under a shrub canopy the way it never does in turf.
    albedo *= 1.0 - bushy * 0.22 * (1.0 - b.a);
  }

  albedo *= 1.0 + (d.a - 0.5) * mix(0.60, 0.92, bushy);
  return Surface(albedo, slope, d.b);
}

/**
 * Beach, dune, shingle, mud — and wind-packed snow, which behaves the same way:
 * a granular surface the wind carves into regular ripples.
 */
Surface sandSurface(sampler2D detail, vec2 p, float rough, vec3 tone) {
  float drift = fbm(p * 0.035, 3);           // 28 m — where it piles and scours

  vec3 albedo = tone * (0.90 + 0.24 * drift);
  vec4 d = hexSample(detail, p / mix(1.4, 5.0, rough));
  albedo *= 1.0 + (d.a - 0.5) * 0.44;
  // A low sun raking across the ripple crests is most of what sells sand, so
  // this family leans harder on its normal than the others.
  return Surface(albedo, detailSlope(d, mix(0.55, 1.0, rough)), d.b);
}

/**
 * Carriageway, ballast, platform slab, bridge deck.
 *
 * The tone arrives per vertex and already says what the way is — motorway
 * asphalt, a gravel track, a concrete platform — so this only has to make the
 * surface a surface. The rough parameter stretches the aggregate: fine for a
 * paved road, coarse for ballast.
 */
Surface asphaltSurface(sampler2D detail, vec2 p, float rough, vec3 tone) {
  // Patching and repair, at the scale a street actually varies.
  float patchwork = fbm(p * 0.09, 3);
  vec3 albedo = tone * (0.90 + 0.22 * patchwork);

  vec4 d = hexSample(detail, p / mix(1.1, 3.0, rough));
  albedo *= 1.0 + (d.a - 0.5) * 0.32;
  // Gentle: chippings are a millimetre-scale relief and a strong normal here
  // turns tarmac into gravel.
  return Surface(albedo, detailSlope(d, mix(0.25, 0.6, rough)), d.b);
}

/** Bare rock, scree, glacier ice. */
Surface rockSurface(sampler2D detail, vec2 p, float rough, vec3 tone) {
  float bed = fbm(p * 0.03, 3);              // 33 m — the shape of the massif

  vec3 albedo = tone * (0.80 + 0.34 * bed);
  vec4 d = hexSample(detail, p / mix(1.2, 3.4, rough));
  albedo *= 1.0 + (d.a - 0.5) * 0.68;
  // Ice is smooth and keeps a highlight; scree is neither. The map's own
  // roughness is pulled toward the family's floor as \`rough\` drops.
  float roughness = mix(min(d.b, 0.35), d.b, clamp(rough * 1.6, 0.0, 1.0));
  return Surface(albedo, detailSlope(d, mix(0.45, 1.15, rough)), roughness);
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
uniform float uTileM;

struct Water {
  vec3 albedo;
  vec2 grad;
  float roughness;
  float foam;
};

Water waterSurface(
  sampler2D waves, vec2 p, float t, float shore,
  vec3 deep, vec3 shallow, float foamM, float shallowM
) {
  // Swell and chop: the SAME baked wave field sampled at two scales, drifting
  // in different directions at different speeds. One scrolling layer reads as a
  // sliding texture; two read as water. Plain sampling, not hex-tiling — two
  // layers at incommensurate scales already destroy the repeat, and hex-tiling
  // would triple the fetches for nothing.
  //
  // Amplitudes, not physical rescalings: the map holds the wave SHAPE and these
  // say how steep this water is. A 12 m swell has a real surface slope around
  // 0.08 and chop around 0.15, which is what these are set to.
  float swellM = 14.0;
  float chopM = 3.5;
  float swellAmp = 0.09;
  float chopAmp = 0.15;
  // Scroll rates are in TILE units per second, so the surface speed is the rate
  // times the span: about 0.6 m/s each, which is a river rather than a canal.
  // Both layers move at a similar speed but in different directions — that
  // crossing is what stops it reading as one sheet sliding past.
  vec4 s1 = texture2D(waves, p / swellM + vec2(t * 0.040, t * 0.016));
  vec4 s2 = texture2D(waves, p / chopM - vec2(t * 0.075, t * 0.130));

  vec2 grad = (s1.rg - 0.5) * (2.0 * swellAmp)
            + (s2.rg - 0.5) * (2.0 * chopAmp);

  // Depth from the bank. Not measured — OSM carries no bathymetry — but
  // "shallower at the edge" is true of every natural body of water.
  float depth = clamp(shore / shallowM, 0.0, 1.0);
  vec3 albedo = mix(shallow, deep, smoothstep(0.0, 1.0, depth));

  // FOAM. Three things separate surf from a white line painted along the bank:
  //
  //   * it SURGES. Water runs up the shore and drains back, so the band has to
  //     breathe rather than sit still. The phase is offset ALONG the bank, or
  //     the whole shoreline pulses in unison and reads as a throbbing outline.
  //   * it is RAGGED at two scales — how far each reach runs up, and the broken
  //     edge of any one reach.
  //   * it is BUBBLY, not flat white. The wave map's own height channel, read
  //     small and scrolling, is a free bubble texture.
  float alongBank = fbm(p * 0.05, 2) * 6.28318;
  float surge = 0.72 + 0.28 * sin(t * 0.55 + alongBank);
  float fringe = fbm(p * 0.9 + vec2(t * 0.06, -t * 0.04), 3);
  float foam = 1.0 - smoothstep(0.0, foamM * surge * (0.45 + 1.1 * fringe), shore);
  foam *= 0.55 + 0.45 * fbm(p * 2.6 - vec2(t * 0.09), 2);

  // Whitecaps: the steepest crests break, anywhere on the water. Subtle, and
  // the reason open water stops being a uniform sheet at a distance.
  float steep = smoothstep(0.55, 1.0, length(grad) * 3.2);
  foam = clamp(max(foam, steep * 0.5), 0.0, 1.0);

  vec3 bubbles = vec3(0.92, 0.95, 0.96)
    * (0.80 + 0.34 * texture2D(waves, p * 0.55 - vec2(t * 0.05, t * 0.02)).a);
  albedo = mix(albedo, bubbles, foam * 0.9);

  // Open water is a near-mirror; foam is not. Getting this split right is what
  // makes the bank read as surf rather than as white paint.
  float roughness = mix(0.022, 0.62, foam);
  // Chop roughens the surface where it is disturbed, which is what breaks the
  // glitter path up into sparkles instead of one hard streak. At distance the
  // mip pyramid flattens the normal, so this fades out on its own — which is
  // exactly right, and is what un-mipmapped noise could never do.
  roughness += length(grad) * 0.08;

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
  asphalt: 'asphaltSurface',
}

/**
 * Default opacity per surface. All of them opaque, water included.
 *
 * WATER WAS 0.62 HERE, on the same reasoning the simple path used at 0.72: a
 * river shows what is under it. True of a river over a modelled bed, false of
 * everything this viewer draws — there is no bathymetry, so what showed through
 * was never depth. It was the basemap photograph, and over a harbour that
 * photograph has street names and road casings printed on it. Measured live on
 * Port Vell, "Ciutat Vella" and "Passeig de Colom" read straight across the
 * open water.
 *
 * For water this is the FLOOR, not the alpha: the shader mixes it up to 1.0
 * with fresnel and foam (see `normal_fragment_maps` below), so a value of 1
 * makes the surface opaque at every angle while leaving that machinery intact.
 * The reflection, which is what should make water read as water, is unaffected
 * — it comes from three's dielectric response to the sky environment, not from
 * seeing the ground through the surface.
 *
 * Note this is a SEPARATE constant from the simple path's, and that is how the
 * first attempt at this fix missed: `buildSimpleSurface` and
 * `buildDetailedSurface` build their materials independently, so a change to
 * one is invisible in the other — and `showcase`, which is what a client demo
 * runs, uses the detailed one.
 */
const DEFAULT_OPACITY: Record<SurfaceKind, number> = {
  grass: 1, sand: 1, rock: 1, water: 1, asphalt: 1,
}

/** Uniforms a caller may want to reach later, kept on `material.userData`. */
export interface SurfaceUniforms {
  uTime: { value: number }
  uOpacity: { value: number }
  uShallowColor: { value: THREE.Color }
  uFoamM: { value: number }
  uShallowM: { value: number }
  uMetresPerUnit: { value: number }
  /** Ground span of one baked tile, so shaders can rescale its slopes. */
  uTileM: { value: number }
}

function makeUniforms(opacity: number): SurfaceUniforms {
  return {
    uTime: { value: 0 },
    uOpacity: { value: opacity },
    uShallowColor: { value: new THREE.Color(0.46, 0.66, 0.64) },
    uFoamM: { value: 3.2 },
    uShallowM: { value: 22 },
    uMetresPerUnit: { value: 1 },
    uTileM: { value: TILE_M },
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
  // Water is animated and cannot come from a static tile; the rest share the
  // three baked maps between every layer and the terrain.
  // Water's map is a wave field rather than a granular detail map, but it is
  // baked, tiled and mipmapped by exactly the same machinery.
  const detail = surfaceTexture(kind as TextureFamily)

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    metalness: 0,
    roughness: 1,
  })
  if (water) {
    // Water is mostly a mirror, and its whole appearance is the sky in it. The
    // default environment weight leaves it looking like tinted glass; pushing
    // it up is what makes the reflection the dominant term it should be.
    material.envMapIntensity = 1.7
  }
  material.name = `surface-${kind}`
  material.userData.uniforms = uniforms
  material.userData.animated = water
  // Without this, three reuses one compiled program for every material that
  // looks alike — and all four of these look alike to the cache key.
  material.customProgramCacheKey = () => `surface-${kind}`

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.uniforms.uDetail = { value: detail }
    // Greenery carries a second map: scrub and heath are bushes, not long grass.
    shader.uniforms.uShrub = { value: surfaceTexture(kind === 'grass' ? 'shrub' : 'grass') }
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
      uniform sampler2D uDetail;
      uniform sampler2D uShrub;
      ${NOISE_GLSL}
      ${water ? '' : HEX_TILE_GLSL}
      ${water ? '' : SURFACE_FN_GLSL}
      ${water ? WATER_GLSL : ''}
    `

    let f = shader.fragmentShader.replace('#include <common>', `#include <common>\n${declarations}`)

    if (water) {
      f = replaceChunk(f, 'map_fragment', /* glsl */ `
        Water w = waterSurface(
          uDetail, vSurf, uTime, vShore,
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
          ${kind === 'grass' ? 'uDetail, uShrub,' : 'uDetail,'} vSurf, vRough,
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
      // Roughness now comes off the baked map, per texel, so a crevice can be
      // rougher than the crest beside it.
      f = replaceChunk(f, 'roughnessmap_fragment',
        'float roughnessFactor = clamp(surf.roughness, 0.05, 1.0);')
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
  const maps = {
    uGrassMap: { value: surfaceTexture('grass') },
    uShrubMap: { value: surfaceTexture('shrub') },
    uRockMap: { value: surfaceTexture('rock') },
    uSandMap: { value: surfaceTexture('sand') },
  }
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
    Object.assign(shader.uniforms, uniforms, maps)
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
      uniform sampler2D uGrassMap;
      uniform sampler2D uShrubMap;
      uniform sampler2D uRockMap;
      uniform sampler2D uSandMap;
      ${NOISE_GLSL}
      ${HEX_TILE_GLSL}
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
      float groundRough = 0.0;
      // Skipping a family whose weight is nil keeps the cost of three materials
      // near the cost of one: a wavefront inside a forest never evaluates the
      // rock or the snow branch, and the belts are large and coherent on screen.
      if (veg > 0.004) {
        Surface s = grassSurface(uGrassMap, uShrubMap, vSurf, beltRough, tone);
        groundAlbedo += s.albedo * veg;
        groundGrad += s.grad * veg;
        groundRough += s.roughness * veg;
      }
      if (mineral > 0.004) {
        Surface s = rockSurface(uRockMap, vSurf, beltRough, tone);
        groundAlbedo += s.albedo * mineral;
        groundGrad += s.grad * mineral;
        groundRough += s.roughness * mineral;
      }
      if (snow > 0.004) {
        // Wind-packed snow is a granular surface the wind carves into regular
        // ripples — sastrugi. That is the sand family, not the rock one.
        Surface s = sandSurface(uSandMap, vSurf, beltRough, tone);
        groundAlbedo += s.albedo * snow;
        groundGrad += s.grad * snow;
        groundRough += s.roughness * snow;
      }
      diffuseColor.rgb = groundAlbedo;
      diffuseColor.a = vColor.a;
    `)
    f = replaceChunk(f, 'color_fragment', '')
    f = replaceChunk(f, 'roughnessmap_fragment',
      'float roughnessFactor = clamp(groundRough, 0.05, 1.0);')
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
