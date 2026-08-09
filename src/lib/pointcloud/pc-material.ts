// ─── pc-material ──────────────────────────────────────────────────────────────
// One ShaderMaterial for every point cloud in the scene, shared by every chunk.
//
// Why not THREE.PointsMaterial: colour modes (intensity ramp, elevation ramp,
// ASPRS classification palette), a confidence cut-off, round sprites and a
// screen-space size mode are all one-uniform changes here and impossible there.
// The repo already writes shaders for the map surfaces (facade-shader.ts,
// surface-shaders.ts), so this is the idiomatic tool, not an exotic one.
//
// Changing any display setting updates uniforms only — no geometry is rebuilt,
// no buffer is re-uploaded, and nothing is re-parsed. That is what makes the
// panel controls feel instant on a 20-million-point cloud.

import * as THREE from 'three'
import type { PointCloudDisplay, PointColorMode } from './pc-types'

const MODE_INDEX: Record<PointColorMode, number> = {
  rgb: 0, intensity: 1, elevation: 2, classification: 3, flat: 4,
}

/**
 * ASPRS standard classification colours (LAS spec table 17), packed as a small
 * lookup the shader indexes directly. Anything outside the table renders in the
 * "unclassified" grey rather than black — an unknown code must still be visible.
 */
const CLASS_COLORS: Array<[number, number, number]> = [
  [0.60, 0.62, 0.67], // 0 created, never classified
  [0.55, 0.57, 0.62], // 1 unclassified
  [0.55, 0.40, 0.28], // 2 ground
  [0.42, 0.62, 0.35], // 3 low vegetation
  [0.33, 0.70, 0.38], // 4 medium vegetation
  [0.20, 0.55, 0.28], // 5 high vegetation
  [0.85, 0.45, 0.35], // 6 building
  [0.90, 0.25, 0.30], // 7 low point (noise)
  [0.70, 0.70, 0.35], // 8 reserved / model key-point
  [0.30, 0.55, 0.90], // 9 water
  [0.75, 0.50, 0.85], // 10 rail
  [0.45, 0.45, 0.50], // 11 road surface
  [0.65, 0.65, 0.70], // 12 overlap
  [0.90, 0.75, 0.35], // 13 wire guard
  [0.95, 0.65, 0.25], // 14 wire conductor
  [0.80, 0.60, 0.40], // 15 transmission tower
]

const VERTEX_SHADER = /* glsl */`
  attribute vec3 pcColor;
  attribute float pcIntensity;
  attribute float pcClass;
  attribute float pcConfidence;

  uniform float uSize;
  uniform float uAttenuate;      // 1 = world-sized, 0 = constant pixels
  uniform float uMode;
  uniform vec3  uFlatColor;
  uniform float uElevMin;
  uniform float uElevMax;
  uniform float uConfidenceMin;
  uniform vec3  uClassColors[16];
  uniform float uPixelRatio;

  varying vec3 vColor;
  varying float vDrop;

  vec3 rampIntensity(float t) {
    // Neutral luminance ramp — reads as "a scan" rather than a heat map.
    return mix(vec3(0.06, 0.07, 0.10), vec3(0.96, 0.97, 1.0), clamp(t, 0.0, 1.0));
  }

  vec3 rampElevation(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 low  = vec3(0.16, 0.30, 0.55);
    vec3 mid  = vec3(0.35, 0.72, 0.55);
    vec3 high = vec3(0.95, 0.86, 0.55);
    return t < 0.5 ? mix(low, mid, t * 2.0) : mix(mid, high, (t - 0.5) * 2.0);
  }

  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Points below the confidence cut-off are pushed off-screen AND flagged, so
    // the fragment stage discards them too. Cheaper than any CPU-side filter and
    // instant when the slider moves — the LingBot-Map --conf_threshold idea,
    // done at 60 fps.
    vDrop = pcConfidence < uConfidenceMin ? 1.0 : 0.0;

    int mode = int(uMode + 0.5);
    if (mode == 0)      vColor = pcColor;
    else if (mode == 1) vColor = rampIntensity(pcIntensity);
    // The elevation ramp reads TRUE scene height, not the chunk-local Z — using
    // the local value would band the ramp separately inside every chunk.
    else if (mode == 2) vColor = rampElevation((worldPos.y - uElevMin) / max(uElevMax - uElevMin, 0.001));
    else if (mode == 3) vColor = uClassColors[int(clamp(pcClass * 255.0, 0.0, 15.0))];
    else                vColor = uFlatColor;

    float attenuated = uSize * uPixelRatio * (300.0 / max(-mvPosition.z, 0.001));
    gl_PointSize = max(1.0, mix(uSize * uPixelRatio, attenuated, uAttenuate));
  }
`

const FRAGMENT_SHADER = /* glsl */`
  uniform float uOpacity;
  uniform float uRound;
  varying vec3 vColor;
  varying float vDrop;

  void main() {
    if (vDrop > 0.5) discard;
    if (uRound > 0.5) {
      vec2 d = gl_PointCoord - vec2(0.5);
      if (dot(d, d) > 0.25) discard;
    }
    gl_FragColor = vec4(vColor, uOpacity);
    #include <colorspace_fragment>
  }
`

export interface PointCloudMaterial extends THREE.ShaderMaterial {
  /** Push a display settings object into the uniforms. */
  applyDisplay(display: PointCloudDisplay, pixelRatio: number): void
  /** Elevation ramp domain, scene metres. */
  setElevationRange(minY: number, maxY: number): void
}

export function createPointCloudMaterial(display: PointCloudDisplay, pixelRatio: number): PointCloudMaterial {
  const classColors = CLASS_COLORS.map(([r, g, b]) => new THREE.Vector3(r, g, b))

  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uSize:          { value: display.pointSize },
      uAttenuate:     { value: display.attenuate ? 1 : 0 },
      uMode:          { value: MODE_INDEX[display.colorMode] },
      uFlatColor:     { value: new THREE.Color(display.flatColor) },
      uElevMin:       { value: 0 },
      uElevMax:       { value: 10 },
      uConfidenceMin: { value: display.confidenceThreshold },
      uClassColors:   { value: classColors },
      uPixelRatio:    { value: pixelRatio },
      uOpacity:       { value: display.opacity },
      uRound:         { value: display.round ? 1 : 0 },
    },
    transparent: display.opacity < 1,
    depthWrite: display.opacity >= 1,
  }) as PointCloudMaterial

  material.applyDisplay = (d, ratio): void => {
    material.uniforms.uSize.value = d.pointSize
    material.uniforms.uAttenuate.value = d.attenuate ? 1 : 0
    material.uniforms.uMode.value = MODE_INDEX[d.colorMode]
    ;(material.uniforms.uFlatColor.value as THREE.Color).set(d.flatColor)
    material.uniforms.uConfidenceMin.value = d.confidenceThreshold
    material.uniforms.uOpacity.value = d.opacity
    material.uniforms.uRound.value = d.round ? 1 : 0
    material.uniforms.uPixelRatio.value = ratio
    const wantsBlend = d.opacity < 1
    if (material.transparent !== wantsBlend) {
      material.transparent = wantsBlend
      material.depthWrite = !wantsBlend
      material.needsUpdate = true
    }
  }

  material.setElevationRange = (minY, maxY): void => {
    material.uniforms.uElevMin.value = minY
    material.uniforms.uElevMax.value = maxY
  }

  return material
}

/** Exported for tests — the mode enum must stay in step with the shader. */
export const POINT_COLOR_MODE_INDEX = MODE_INDEX
