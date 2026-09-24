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
  material.customProgramCacheKey = () => 'facade-lit'

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uGlassRoughness = { value: GLASS_ROUGHNESS }
    shader.uniforms.uWallRoughness = { value: WALL_ROUGHNESS }
    shader.uniforms.uGlassBelow = { value: GLASS_BELOW }

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
      `)
      .replace('#include <begin_vertex>', /* glsl */ `
        #include <begin_vertex>
        vFacA = aFacA; vFacB = aFacB; vFacC = aFacC;
      `)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        uniform float uGlassRoughness;
        uniform float uWallRoughness;
        uniform float uGlassBelow;
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
      `)
      .replace(token, /* glsl */ `
        // The darker the band, the more likely it is glazing rather than wall.
        // Smoothstep rather than a threshold: a hard cut would draw a crisp line
        // along every spandrel, and the bands are a soft cosine to begin with.
        float facadeLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float glassiness = 1.0 - smoothstep(uGlassBelow * 0.6, uGlassBelow * 1.6, facadeLuma);
        float roughnessFactor = facRough >= 0.0 ? facRough : mix(uWallRoughness, uGlassRoughness, glassiness);
      `)
  }

  return material
}
