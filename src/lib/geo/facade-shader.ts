// ─── facade-shader ────────────────────────────────────────────────────────────
// A lit material for the surrounding buildings.
//
// The problem it solves: every other surface in the scene is now lit by one
// agreed sun — the terrain hillshade, the grass, the water, the tree canopies.
// The buildings were the last thing still flat-shaded with light baked into
// vertex colours, and a block of buildings that does not react to the same sun
// as the ground it stands on is exactly what makes a view read as a diagram.
//
// It follows the same contract as surface-shaders so nothing has to special-case
// it: the sun arrives as `uSunLocal` in the layer's own planar frame (+x east,
// +y north, +z up), which means `applySurfaceSun` drives this material for free
// when the user moves the sun sliders.
//
// Vertex colour stays the ALBEDO — storey banding, ground-floor glazing, tagged
// building colours. Lighting is computed here instead of being multiplied in
// twice, which is why building-mesh stops baking its own directional shade when
// this material is in play.

import * as THREE from 'three'
import { sunDirectionLocal, type SurfaceSun } from './surface-shaders'

export interface FacadeMaterialOptions {
  sun: SurfaceSun
}

const VERTEX = /* glsl */ `
  uniform vec3 uSunLocal;

  varying vec3 vTone;
  varying vec3 vNormalW;
  varying vec3 vSunW;
  varying vec3 vUpW;

  #include <fog_pars_vertex>

  void main() {
    #ifdef USE_COLOR
      vTone = color;
    #else
      vTone = vec3(1.0);
    #endif

    mat3 m = mat3(modelMatrix);
    vNormalW = normalize(m * normal);
    vSunW    = normalize(m * uSunLocal);
    vUpW     = normalize(m * vec3(0.0, 0.0, 1.0));

    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;

    #include <fog_vertex>
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uGroundColor;

  varying vec3 vTone;
  varying vec3 vNormalW;
  varying vec3 vSunW;
  varying vec3 vUpW;

  #include <fog_pars_fragment>

  void main() {
    vec3 n = normalize(vNormalW);

    // Direct sun. Hard-edged on purpose: a facade in shadow and a facade in
    // light is the single strongest cue that a box is a solid object, and
    // softening it is what made the old baked shading look like a gradient.
    float ndl = max(dot(n, normalize(vSunW)), 0.0);

    // Sky above, bounce below — a wall sees half the sky, a roof sees all of
    // it, and the ground throws a little light back up under eaves and awnings.
    float up = dot(n, normalize(vUpW));
    vec3 ambient = mix(uGroundColor, uSkyColor, up * 0.5 + 0.5);

    vec3 lit = vTone * (ambient + uSunColor * ndl);

    gl_FragColor = vec4(lit, 1.0);

    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

/**
 * Lit facades. One material for the whole neighbourhood — the buildings are a
 * single merged geometry, so this is one draw call however many blocks there are.
 */
export function createFacadeMaterial(opts: FacadeMaterialOptions): THREE.ShaderMaterial {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uSunLocal: { value: new THREE.Vector3() },
      // Warm sun against a cool sky: the same pairing the ground surfaces use,
      // so a wall and the lawn beside it agree about the time of day.
      uSunColor:    { value: new THREE.Color(0.72, 0.68, 0.60) },
      uSkyColor:    { value: new THREE.Color(0.34, 0.38, 0.46) },
      uGroundColor: { value: new THREE.Color(0.17, 0.16, 0.15) },
    },
  ])
  uniforms.uSunLocal.value = sunDirectionLocal(opts.sun)

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    vertexColors: true,
    fog: true,
  })
  material.name = 'facade-lit'
  return material
}
