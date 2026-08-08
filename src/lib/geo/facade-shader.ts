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

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `
        #include <common>
        uniform float uGlassRoughness;
        uniform float uWallRoughness;
        uniform float uGlassBelow;
      `)
      .replace(token, /* glsl */ `
        // The darker the band, the more likely it is glazing rather than wall.
        // Smoothstep rather than a threshold: a hard cut would draw a crisp line
        // along every spandrel, and the bands are a soft cosine to begin with.
        float facadeLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        float glassiness = 1.0 - smoothstep(uGlassBelow * 0.6, uGlassBelow * 1.6, facadeLuma);
        float roughnessFactor = mix(uWallRoughness, uGlassRoughness, glassiness);
      `)
  }

  return material
}
