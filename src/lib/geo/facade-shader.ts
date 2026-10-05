// ─── facade-shader ────────────────────────────────────────────────────────────
// A physically based material for the surrounding buildings.
//
// The problem it solves: every other surface in the scene is lit by one agreed
// sun — the terrain, the grass, the water, the tree canopies, the carriageways.
// The buildings were the last thing shading themselves, and a block that does
// not react to the same light as the ground it stands on is exactly what makes
// a view read as a diagram.
//
// It was originally a self-lit ShaderMaterial with its own `uSunLocal`. That was
// right when nothing else had real lighting; once the ground moved to PBR with a
// sky environment it became the second sun in a scene that had just been reduced
// to one. Now it extends MeshStandardMaterial like the surfaces do, so it picks
// up the same key light, the same sky, and received shadows for free.
//
// VERTEX COLOUR IS THE ALBEDO — storey banding, ground-floor glazing, tagged
// building colours, all baked by building-mesh. Three's own `color_fragment`
// already multiplies it into the diffuse, so almost nothing has to be injected.
//
// The one thing worth adding is roughness. building-mesh encodes glazing as
// DARKER bands, and dark-and-smooth versus pale-and-matte is precisely the
// difference between a window and a rendered wall. Deriving roughness from the
// albedo's own luminance costs three lines and is what finally makes windows
// reflect the sky instead of reading as grey paint.

import * as THREE from 'three'
import type { SurfaceSun } from './surface-shaders'
import type { BuildingFinish, LightPreset } from './map-look'

// ── The look (map-look.ts) ────────────────────────────────────────────────────
// Module-level uniforms, shared by every facade material: there is one city on
// screen, and a look change must reach it in the next frame without a rebuild
// or a recompile — only these values move.
const LOOK_UNIFORMS = {
  uFinishTint: { value: new THREE.Color(1, 1, 1) },
  uFinishMix: { value: 0 },
  uFinishRelief: { value: 1 },
  uWindowGlow: { value: 0 },
  uGlowColor: { value: new THREE.Color('#ffd9a0') },
  /** What the light preset does to an UNLIT surface (simple detail). */
  uLightTint: { value: new THREE.Color(1, 1, 1) },
  /** World Y of the map's ground — where the street-level wash starts. */
  uGroundY: { value: 0 },
}

/** Tell the facades where the street is (the map ground moves with placement). */
export function setFacadeGround(y: number): void {
  LOOK_UNIFORMS.uGroundY.value = y
}

/**
 * The night light that falls ON the facades, shared by the lit and the unlit
 * material so both detail levels read the same after dark:
 *   • street level — shopfronts and street lights wash the first ~6 m warm;
 *   • landmarks — from ~40 m of REAL building height (aTopH), an uplight
 *     sheen over the facade and a lit crown over its top quarter. Without the
 *     attribute it falls back to the fragment's own height.
 * Needs: uWindowGlow, uGroundY, vLookPos, vLookN, vTopH. Zero by day.
 */
const NIGHT_WASH_GLSL = /* glsl */ `
  float lookNightWash() {
    if (uWindowGlow <= 0.0 || abs(vLookN.y) >= 0.5) return 0.0;
    float hy = vLookPos.y - uGroundY;
    float wash = (1.0 - smoothstep(0.0, 6.0, hy)) * step(-0.5, hy) * 0.32;
    if (vTopH > 0.0) {
      float landmark = smoothstep(40.0, 80.0, vTopH);
      float rel = clamp(hy / vTopH, 0.0, 1.0);
      wash += landmark * (0.10 + 0.28 * smoothstep(0.72, 0.98, rel));
    } else {
      wash += smoothstep(35.0, 90.0, hy) * 0.22;
    }
    return wash;
  }
`

/** Vertex side of the above: world position/normal and the building height. */
const NIGHT_WASH_VERTEX_DECL = /* glsl */ `
  attribute float aTopH;
  varying float vTopH;
  varying vec3 vLookPos;
  varying vec3 vLookN;
`
const NIGHT_WASH_VERTEX_MAIN = /* glsl */ `
  vTopH = aTopH;
  vLookPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vLookN = normalize(mat3(modelMatrix) * normal);
`
const NIGHT_WASH_FRAG_DECL = /* glsl */ `
  uniform float uGroundY;
  varying float vTopH;
  varying vec3 vLookPos;
  varying vec3 vLookN;
`

/** Point every facade at a finish and a light preset. Instant: uniforms only. */
export function setFacadeLook(finish: BuildingFinish, light: LightPreset): void {
  LOOK_UNIFORMS.uFinishTint.value.set(finish.tint)
  LOOK_UNIFORMS.uFinishMix.value = finish.tintMix
  LOOK_UNIFORMS.uFinishRelief.value = finish.relief
  LOOK_UNIFORMS.uWindowGlow.value = light.windowGlow
  LOOK_UNIFORMS.uGlowColor.value.set(light.glowColor)
  LOOK_UNIFORMS.uLightTint.value.set(light.groundTint)
}

/**
 * The facade at 'simple' detail: no lighting (cheap — the reason simple
 * exists), but the same finish, the same light tint as the ground and the
 * same lit windows at night, so a look reads the same at every detail level.
 * Glazing is found by luminance (the storey bands are darker), like the lit
 * material does for facades without a fabric.
 */
export function createUnlitFacadeMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true })
  material.name = 'facade-unlit'
  material.customProgramCacheKey = () => 'facade-unlit-look'
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, LOOK_UNIFORMS)
    const token = '#include <color_fragment>'
    if (!shader.fragmentShader.includes(token)) {
      throw new Error('facade-shader: three no longer emits <color_fragment> (unlit)')
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        ${NIGHT_WASH_VERTEX_DECL}
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        ${NIGHT_WASH_VERTEX_MAIN}
      `)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        uniform vec3 uFinishTint;
        uniform float uFinishMix;
        uniform float uFinishRelief;
        uniform float uWindowGlow;
        uniform vec3 uGlowColor;
        uniform vec3 uLightTint;
        ${NIGHT_WASH_FRAG_DECL}
        ${NIGHT_WASH_GLSL}
        float lookHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      `)
      .replace(token, /* glsl */ `
        #include <color_fragment>
        {
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float relief = mix(1.0, clamp(lum / 0.42, 0.3, 1.5), uFinishRelief);
          vec3 c = mix(diffuseColor.rgb, uFinishTint * relief, uFinishMix) * uLightTint;

          // Lit windows at night. Simple detail has no fabric to tell where
          // the openings are, so a window grid is laid on every WALL (never a
          // roof) in world metres: storeys of 3.1 m, bays of 3.2 m, about half
          // the panes lit at random. Free by day: uWindowGlow is 0.
          float win = 0.0;
          if (uWindowGlow > 0.0 && abs(vLookN.y) < 0.5) {
            vec2 along = normalize(vec2(-vLookN.z, vLookN.x));
            vec2 g = vec2(dot(vLookPos.xz, along) / 3.2, vLookPos.y / 3.1);
            vec2 cell = floor(g);
            vec2 f = fract(g);
            float pane = step(0.28, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.78);
            float lit = step(0.5, lookHash(cell + floor(vLookPos.xz * 0.05)));
            // When a cell is smaller than a couple of pixels the pattern
            // would shimmer: fade to its average density instead.
            float fine = clamp(max(fwidth(g.x), fwidth(g.y)) * 1.5 - 0.6, 0.0, 1.0);
            win = mix(pane * lit, 0.05, fine);
          }
          // No luminance glow here: simple-detail buildings are flat colours,
          // so a dark-painted block would read as one huge lit window.
          // Street level after dark: shopfronts and street lights wash the
          // first storeys warm, fading out by ~6 m. It is what puts the city's
          // light ON THE GROUND rather than only in its windows.
          float wash = lookNightWash();
          diffuseColor.rgb = c + uGlowColor * uWindowGlow * (win * 0.9 + wash);
        }
      `)
  }
  return material
}

/** The current light tint, for plain unlit layers (roads, parks, water…). */
export function currentLightTint(): THREE.Color {
  return LOOK_UNIFORMS.uLightTint.value
}

export interface FacadeMaterialOptions {
  /**
   * Kept for callers that still pass it, and ignored: the facade is lit by the
   * scene and the sky environment now, both of which already follow the relief
   * sun. Aiming a third light here is what the rewrite removed.
   */
  sun?: SurfaceSun
}

/** Roughness of a pale, matte wall — render, stone, brick. */
const WALL_ROUGHNESS = 0.94
/** Roughness of glazing. Low, but not a mirror: architectural glass is coated. */
const GLASS_ROUGHNESS = 0.16
/**
 * Albedo luminance at which a band stops reading as glass and starts reading as
 * wall. Glazing is baked at roughly half the wall's brightness, so the midpoint
 * between them is the natural split.
 */
const GLASS_BELOW = 0.34
/**
 * Luminance band that counts as a WINDOW for night glow. Much darker than
 * GLASS_BELOW: that one only steers roughness, where a wall read as slightly
 * glossy costs nothing; for glow the same mistake lit whole Barcelona facades
 * orange (their render sits ~0.25 linear, under GLASS_BELOW). Glazing bands
 * are baked at about half the wall — 0.05–0.12 — so the window is below 0.13.
 */
const GLOW_LUMA_LOW = 0.05
const GLOW_LUMA_HIGH = 0.13

/**
 * Lit facades. One material for the whole neighbourhood — the buildings are a
 * single merged geometry, so this is one draw call however many blocks there are.
 */
export function createFacadeMaterial(_opts: FacadeMaterialOptions = {}): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    metalness: 0,
    roughness: WALL_ROUGHNESS,
  })
  material.name = 'facade-lit'
  material.customProgramCacheKey = () => 'facade-lit-look'

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlassRoughness = { value: GLASS_ROUGHNESS }
    shader.uniforms.uWallRoughness = { value: WALL_ROUGHNESS }
    shader.uniforms.uGlassBelow = { value: GLASS_BELOW }
    Object.assign(shader.uniforms, LOOK_UNIFORMS)

    const emissiveToken = '#include <emissivemap_fragment>'
    if (!shader.fragmentShader.includes(emissiveToken)) {
      throw new Error('facade-shader: three no longer emits <emissivemap_fragment>')
    }

    const token = '#include <roughnessmap_fragment>'
    if (!shader.fragmentShader.includes(token)) {
      // Silent failure here would look like "the buildings just went matte"
      // after a three upgrade, which is a miserable thing to debug.
      throw new Error('facade-shader: three no longer emits <roughnessmap_fragment>')
    }

    const colorToken = '#include <color_fragment>'
    if (!shader.fragmentShader.includes(colorToken)) {
      throw new Error('facade-shader: three no longer emits <color_fragment>')
    }

    // THE PROCEDURAL FACADE. Walls that building-mesh tagged with a fabric
    // (aFacB.y > 0: a storey height) get their openings drawn here, per pixel:
    // a quad per wall instead of two per storey, and windows that line up in
    // bays, carry shutters and balconies, and stop at a party wall. Everything
    // else — roofs, the storey-banded facade used where no fabric is known —
    // arrives with the attributes at zero and is left exactly as it was.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        attribute vec4 aFacA;
        attribute vec4 aFacB;
        attribute vec4 aFacC;
        varying vec4 vFacA;
        varying vec4 vFacB;
        varying vec4 vFacC;
        ${NIGHT_WASH_VERTEX_DECL}
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vFacA = aFacA; vFacB = aFacB; vFacC = aFacC;
        ${NIGHT_WASH_VERTEX_MAIN}
      `)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        uniform float uGlassRoughness;
        uniform float uWallRoughness;
        uniform float uGlassBelow;
        uniform vec3 uFinishTint;
        uniform float uFinishMix;
        uniform float uFinishRelief;
        uniform float uWindowGlow;
        uniform vec3 uGlowColor;
        ${NIGHT_WASH_FRAG_DECL}
        ${NIGHT_WASH_GLSL}
        varying vec4 vFacA;
        varying vec4 vFacB;
        varying vec4 vFacC;
        float facHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        // Anti-aliased box: 1 inside [-hw, hw], soft over one pixel.
        float facBox(float x, float hw) {
          float w = max(fwidth(x), 1e-5);
          return 1.0 - smoothstep(hw - w, hw + w, abs(x));
        }
        // A stripe pattern that fades to its average once it is finer than a pixel,
        // instead of shimmering into moire across a whole street.
        float facStripes(float x, float duty) {
          float w = fwidth(x);
          float s = step(1.0 - duty, fract(x));
          return mix(s, duty, clamp(w * 1.5, 0.0, 1.0));
        }
      `)
      .replace(colorToken, /* glsl */ `
        #include <color_fragment>
        float facRough = -1.0;
        float facGlow = 0.0;   // 1 where a pane is lit from inside (night)
        if (vFacB.y > 0.0) {
          float u = vFacA.x, h = vFacA.y, L = vFacA.z, top = vFacA.w;
          float G = vFacB.x, S = vFacB.y, bay = vFacB.z, ww = vFacB.w;
          vec3 wall = diffuseColor.rgb;
          vec3 col = wall;
          float rough = uWallRoughness;
          vec3 glassC = vec3(0.055, 0.07, 0.085);
          vec3 iron = vec3(0.09, 0.10, 0.10);

          // Plinth: the ground floor is stone or a darker render.
          if (h < G) col *= 0.86;
          // Floor lines: the slab edge of every storey, faint.
          if (h > G && h < top - 0.9) {
            float fv = fract((h - G) / S);
            col *= 1.0 - 0.09 * (1.0 - smoothstep(0.0, 0.04, fv));
          }
          // Cornice under the parapet.
          col *= 1.0 - 0.12 * facBox(h - (top - 0.95), 0.06);

          if (bay > 0.0 && L > 0.0) {
            float n = max(1.0, floor(L / bay + 0.35));
            float bw = L / n;
            float bayId = floor(u / bw);
            float cu = (fract(u / bw) - 0.5) * bw;       // metres from the bay's axis
            float seed = fract(vFacC.w);
            bool balcony = vFacC.w >= 1.0;
            float ends = facBox(u - L * 0.5, L * 0.5 - 0.45);  // no opening hard against a corner

            if (h > 0.0 && h < G) {
              // Shopfronts: one wide opening per bay under a stone lintel.
              float halfW = min(bw * 0.38, 1.7);
              float m = facBox(cu, halfW) * facBox(h - (G - 0.75) * 0.5, (G - 0.95) * 0.5) * ends;
              float r = facHash(vec3(bayId, 0.0, seed * 91.0));
              vec3 shop = r < 0.3
                ? vec3(0.44, 0.45, 0.45) * (0.85 + 0.15 * facStripes(h * 8.0, 0.5))   // roller shutter down
                : glassC;
              col = mix(col, shop, m);
              rough = mix(rough, r < 0.3 ? 0.5 : uGlassRoughness, m);
              // Shops are lit after dark unless their shutter is down.
              facGlow = max(facGlow, m * (r < 0.3 ? 0.0 : 1.0));
            } else if (h >= G && h < top - 0.95) {
              float k = floor((h - G) / S);
              float fv = (h - G) - k * S;                 // metres into the storey
              float halfW = min(ww, bw * 0.72) * 0.5;
              float winH = min(S - 0.55, 2.35);           // French doors: balcony openings
              float wy = fv - (0.12 + winH * 0.5);
              float opening = facBox(cu, halfW) * facBox(wy, winH * 0.5) * ends;
              float frame = opening * (1.0 - facBox(cu, halfW - 0.07) * facBox(wy, winH * 0.5 - 0.07));
              float r = facHash(vec3(bayId, k, seed * 57.0));
              vec3 shutter = vFacC.rgb * (0.8 + 0.2 * facStripes(h * 11.0, 0.55));
              // A third closed, a third half open, the rest glass.
              float leaf = r < 0.34 ? 1.0 : r < 0.64 ? step(halfW * 0.5, abs(cu)) : 0.0;
              vec3 fill = mix(glassC, shutter, leaf);
              float fillRough = mix(uGlassRoughness, 0.62, leaf);
              col = mix(col, fill, opening - frame);
              col = mix(col, wall * 0.72, frame);
              rough = mix(rough, fillRough, opening - frame);
              // Some homes are lit, most are not: a fully lit block reads as
              // an office tower, a random half as a neighbourhood at night.
              float lit = step(0.55, facHash(vec3(bayId, k, seed * 13.0)));
              facGlow = max(facGlow, (opening - frame) * (1.0 - leaf) * lit);

              if (balcony) {
                // An iron railing across the foot of the opening, a little
                // wider than it, standing on a thin slab in its own shadow.
                float railZone = facBox(cu, halfW + 0.28) * facBox(fv - 0.52, 0.5) * ends;
                float slab = railZone * facBox(fv - 0.03, 0.05);
                float bars = max(facStripes(u * 8.0, 0.28), max(facBox(fv - 0.98, 0.04), facBox(fv - 0.12, 0.03)));
                col = mix(col, wall * 0.55, slab);
                col = mix(col, iron, railZone * (1.0 - slab) * bars);
                rough = mix(rough, 0.55, railZone * bars);
              }
            }
          }
          // Contact shade at grade — ambient occlusion, which light does not undo.
          col *= mix(0.8, 1.0, smoothstep(0.0, 1.4, h));
          diffuseColor.rgb = col;
          facRough = rough;
        }
        // THE FINISH. Repaint in one material colour but keep the facade's own
        // light/dark relief (windows, floors, cornice) at uFinishRelief — a
        // white-card model still shows its openings, which is what makes it a
        // building rather than a block.
        {
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          float relief = mix(1.0, clamp(lum / 0.42, 0.3, 1.5), uFinishRelief);
          diffuseColor.rgb = mix(diffuseColor.rgb, uFinishTint * relief, uFinishMix);
        }
      `)
      .replace(token, /* glsl */ `
        // The darker the band, the more likely it is glazing rather than wall.
        // Smoothstep rather than a threshold: a hard cut would draw a crisp line
        // along every spandrel, and the bands are a soft cosine to begin with.
        float facadeLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float glassiness = 1.0 - smoothstep(uGlassBelow * 0.6, uGlassBelow * 1.6, facadeLuma);
        float roughnessFactor = facRough >= 0.0 ? facRough : mix(uWallRoughness, uGlassRoughness, glassiness);
      `)
      .replace(emissiveToken, /* glsl */ `
        #include <emissivemap_fragment>
        // Windows lit from inside. Emissive, not a light: it does not depend
        // on the sun, so at night the city is drawn by its own windows. The
        // storey-banded facades (no fabric) glow along their glazing bands.
        float bandGlow = 1.0 - smoothstep(${GLOW_LUMA_LOW.toFixed(3)}, ${GLOW_LUMA_HIGH.toFixed(3)}, facadeLuma);
        totalEmissiveRadiance += uGlowColor * uWindowGlow * ((facRough >= 0.0 ? facGlow : bandGlow * 0.3) + lookNightWash());
      `)
  }

  return material
}
