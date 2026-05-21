// ─── LineWaves ────────────────────────────────────────────────────────────────
// Raw-WebGL port of the React Bits LineWaves component.
// Uses the original React Bits fragment shader (displaceA / displaceB warp
// fields) but avoids OGL entirely to prevent `bool` / `int` uniform type
// incompatibilities that crash OGL's internal uniform setter.
//
// Key differences from the OGL version:
//   • Raw WebGL context — no external GL abstraction library
//   • `uniform bool uEnableMouse`  → `uniform float uEnableMouse` (0/1)
//   • Canvas sized via ResizeObserver on the wrapper div, not window resize
//   • propsRef pattern keeps uniforms in sync without restarting the effect
//
// Cleanup: rAF, ResizeObserver, mousemove/leave listeners, GL resources.
//
// Usage:
//   <LineWaves
//     speed={0.15}
//     innerLineCount={18}
//     outerLineCount={22}
//     warpIntensity={0.6}
//     rotation={-30}
//     edgeFadeWidth={0.15}
//     colorCycleSpeed={0.0}
//     brightness={0.07}
//     color1="#5E6AD2"
//     color2="#8B93E8"
//     color3="#4a5280"
//     enableMouseInteraction={true}
//     mouseInfluence={0.8}
//   />

import React, { useRef, useEffect } from 'react'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface LineWavesProps {
  speed?:                  number
  innerLineCount?:         number
  outerLineCount?:         number
  warpIntensity?:          number
  rotation?:               number
  edgeFadeWidth?:          number
  colorCycleSpeed?:        number
  brightness?:             number
  color1?:                 string
  color2?:                 string
  color3?:                 string
  enableMouseInteraction?: boolean
  mouseInfluence?:         number
  className?:              string
  style?:                  React.CSSProperties
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToVec3(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ]
}

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!
  gl.shaderSource(sh, src)
  gl.compileShader(sh)
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
    throw new Error(gl.getShaderInfoLog(sh) ?? 'shader compile error')
  return sh
}

function createProgram(gl: WebGLRenderingContext, vert: string, frag: string): WebGLProgram {
  const prog = gl.createProgram()!
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vert))
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(prog)
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(prog) ?? 'program link error')
  return prog
}

// ── GLSL ──────────────────────────────────────────────────────────────────────

// Fullscreen triangle — fragment uses gl_FragCoord so no varying needed.
const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

// Original React Bits shader, with:
//   uniform bool uEnableMouse  →  uniform float uEnableMouse  (0.0 / 1.0)
const FRAG = `
precision highp float;

uniform float uTime;
uniform vec3  uResolution;
uniform float uSpeed;
uniform float uInnerLines;
uniform float uOuterLines;
uniform float uWarpIntensity;
uniform float uRotation;
uniform float uEdgeFadeWidth;
uniform float uColorCycleSpeed;
uniform float uBrightness;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec2  uMouse;
uniform float uMouseInfluence;
uniform float uEnableMouse;

#define HALF_PI 1.5707963

float hashF(float n) {
  return fract(sin(n * 127.1) * 43758.5453123);
}

float smoothNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(hashF(i), hashF(i + 1.0), u);
}

float displaceA(float coord, float t) {
  float result = sin(coord * 2.123) * 0.2;
  result += sin(coord * 3.234 + t * 4.345) * 0.1;
  result += sin(coord * 0.589 + t * 0.934) * 0.5;
  return result;
}

float displaceB(float coord, float t) {
  float result = sin(coord * 1.345) * 0.3;
  result += sin(coord * 2.734 + t * 3.345) * 0.2;
  result += sin(coord * 0.189 + t * 0.934) * 0.3;
  return result;
}

vec2 rotate2D(vec2 p, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

void main() {
  vec2 coords = gl_FragCoord.xy / uResolution.xy;
  coords = coords * 2.0 - 1.0;
  coords = rotate2D(coords, uRotation);

  float halfT = uTime * uSpeed * 0.5;
  float fullT = uTime * uSpeed;

  float mouseWarp = 0.0;
  if (uEnableMouse > 0.5) {
    vec2  mPos  = rotate2D(uMouse * 2.0 - 1.0, uRotation);
    float mDist = length(coords - mPos);
    mouseWarp = uMouseInfluence * exp(-mDist * mDist * 4.0);
  }

  float warpAx = coords.x + displaceA(coords.y, halfT) * uWarpIntensity + mouseWarp;
  float warpAy = coords.y - displaceA(coords.x * cos(fullT) * 1.235, halfT) * uWarpIntensity;
  float warpBx = coords.x + displaceB(coords.y, halfT) * uWarpIntensity + mouseWarp;
  float warpBy = coords.y - displaceB(coords.x * sin(fullT) * 1.235, halfT) * uWarpIntensity;

  vec2 fieldA  = vec2(warpAx, warpAy);
  vec2 fieldB  = vec2(warpBx, warpBy);
  vec2 blended = mix(fieldA, fieldB, mix(fieldA, fieldB, 0.5));

  float fadeTop    = smoothstep( uEdgeFadeWidth,  uEdgeFadeWidth + 0.4, blended.y);
  float fadeBottom = smoothstep(-uEdgeFadeWidth, -(uEdgeFadeWidth + 0.4), blended.y);
  float vMask      = 1.0 - max(fadeTop, fadeBottom);

  float tileCount = mix(uOuterLines, uInnerLines, vMask);
  float scaledY   = blended.y * tileCount;
  float nY        = smoothNoise(abs(scaledY));

  float ridge = pow(
    step(abs(nY - blended.x) * 2.0, HALF_PI) * cos(2.0 * (nY - blended.x)),
    5.0
  );

  float lines = 0.0;
  for (float i = 1.0; i < 3.0; i += 1.0) {
    lines += pow(max(fract(scaledY), fract(-scaledY)), i * 2.0);
  }

  float pattern = vMask * lines;

  float cycleT   = fullT * uColorCycleSpeed;
  float rChannel = (pattern + lines * ridge) * (cos(blended.y + cycleT * 0.234) * 0.5 + 1.0);
  float gChannel = (pattern + vMask  * ridge) * (sin(blended.x + cycleT * 1.745) * 0.5 + 1.0);
  float bChannel = (pattern + lines * ridge) * (cos(blended.x + cycleT * 0.534) * 0.5 + 1.0);

  vec3  col   = (rChannel * uColor1 + gChannel * uColor2 + bChannel * uColor3) * uBrightness;
  float alpha = clamp(length(col), 0.0, 1.0);

  gl_FragColor = vec4(col, alpha);
}
`

// ── Component ─────────────────────────────────────────────────────────────────

export default function LineWaves({
  speed                 = 0.3,
  innerLineCount        = 32,
  outerLineCount        = 36,
  warpIntensity         = 1.0,
  rotation              = -45,
  edgeFadeWidth         = 0.0,
  colorCycleSpeed       = 1.0,
  brightness            = 0.2,
  color1                = '#ffffff',
  color2                = '#ffffff',
  color3                = '#ffffff',
  enableMouseInteraction = true,
  mouseInfluence        = 2.0,
  className             = '',
  style,
}: LineWavesProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep latest props readable in the rAF loop without restarting the effect.
  const propsRef = useRef({
    speed, innerLineCount, outerLineCount, warpIntensity,
    rotation, edgeFadeWidth, colorCycleSpeed, brightness,
    color1, color2, color3, enableMouseInteraction, mouseInfluence,
  })
  propsRef.current = {
    speed, innerLineCount, outerLineCount, warpIntensity,
    rotation, edgeFadeWidth, colorCycleSpeed, brightness,
    color1, color2, color3, enableMouseInteraction, mouseInfluence,
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof window === 'undefined') return

    // ── Canvas & context ────────────────────────────────────────────────
    const canvas = document.createElement('canvas')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none'
    container.appendChild(canvas)

    const gl = canvas.getContext('webgl', {
      alpha:              true,
      premultipliedAlpha: false,
      antialias:          false,
    })
    if (!gl) { container.removeChild(canvas); return }

    gl.clearColor(0, 0, 0, 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    // ── Compile program ─────────────────────────────────────────────────
    let prog: WebGLProgram
    try {
      prog = createProgram(gl, VERT, FRAG)
    } catch (e) {
      console.error('[LineWaves] Shader error:', e)
      container.removeChild(canvas)
      return
    }

    // ── Fullscreen triangle ─────────────────────────────────────────────
    // Three vertices that cover all clip-space (single draw call, no IBO).
    const posLoc = gl.getAttribLocation(prog, 'position')
    const posBuf = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)

    // ── Uniform locations ───────────────────────────────────────────────
    gl.useProgram(prog)
    const U = {
      uTime:            gl.getUniformLocation(prog, 'uTime'),
      uResolution:      gl.getUniformLocation(prog, 'uResolution'),
      uSpeed:           gl.getUniformLocation(prog, 'uSpeed'),
      uInnerLines:      gl.getUniformLocation(prog, 'uInnerLines'),
      uOuterLines:      gl.getUniformLocation(prog, 'uOuterLines'),
      uWarpIntensity:   gl.getUniformLocation(prog, 'uWarpIntensity'),
      uRotation:        gl.getUniformLocation(prog, 'uRotation'),
      uEdgeFadeWidth:   gl.getUniformLocation(prog, 'uEdgeFadeWidth'),
      uColorCycleSpeed: gl.getUniformLocation(prog, 'uColorCycleSpeed'),
      uBrightness:      gl.getUniformLocation(prog, 'uBrightness'),
      uColor1:          gl.getUniformLocation(prog, 'uColor1'),
      uColor2:          gl.getUniformLocation(prog, 'uColor2'),
      uColor3:          gl.getUniformLocation(prog, 'uColor3'),
      uMouse:           gl.getUniformLocation(prog, 'uMouse'),
      uMouseInfluence:  gl.getUniformLocation(prog, 'uMouseInfluence'),
      uEnableMouse:     gl.getUniformLocation(prog, 'uEnableMouse'),
    }

    // ── Mouse — smooth lerp toward target ───────────────────────────────
    let curX = 0.5, curY = 0.5
    let tgtX = 0.5, tgtY = 0.5

    const onMouseMove = (e: MouseEvent): void => {
      if (!propsRef.current.enableMouseInteraction) return
      const rect = canvas.getBoundingClientRect()
      tgtX = (e.clientX - rect.left) / rect.width
      tgtY = 1 - (e.clientY - rect.top) / rect.height
    }
    const onMouseLeave = (): void => { tgtX = 0.5; tgtY = 0.5 }
    window.addEventListener('mousemove',  onMouseMove)
    window.addEventListener('mouseleave', onMouseLeave)

    // ── Resize ──────────────────────────────────────────────────────────
    const resize = (): void => {
      const w = container.offsetWidth  || 1
      const h = container.offsetHeight || 1
      canvas.width  = w
      canvas.height = h
      gl.viewport(0, 0, w, h)
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    // ── Render loop ──────────────────────────────────────────────────────
    let rafId = 0

    const tick = (t: number): void => {
      rafId = requestAnimationFrame(tick)

      const p = propsRef.current

      // Smooth mouse lerp
      curX += 0.05 * (tgtX - curX)
      curY += 0.05 * (tgtY - curY)

      const w = canvas.width  || 1
      const h = canvas.height || 1
      const [r1, g1, b1] = hexToVec3(p.color1)
      const [r2, g2, b2] = hexToVec3(p.color2)
      const [r3, g3, b3] = hexToVec3(p.color3)

      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(prog)

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf)
      gl.enableVertexAttribArray(posLoc)
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0)

      gl.uniform1f(U.uTime,            t * 0.001)
      gl.uniform3f(U.uResolution,      w, h, w / h)
      gl.uniform1f(U.uSpeed,           p.speed)
      gl.uniform1f(U.uInnerLines,      p.innerLineCount)
      gl.uniform1f(U.uOuterLines,      p.outerLineCount)
      gl.uniform1f(U.uWarpIntensity,   p.warpIntensity)
      gl.uniform1f(U.uRotation,        (p.rotation * Math.PI) / 180)
      gl.uniform1f(U.uEdgeFadeWidth,   p.edgeFadeWidth)
      gl.uniform1f(U.uColorCycleSpeed, p.colorCycleSpeed)
      gl.uniform1f(U.uBrightness,      p.brightness)
      gl.uniform3f(U.uColor1,          r1, g1, b1)
      gl.uniform3f(U.uColor2,          r2, g2, b2)
      gl.uniform3f(U.uColor3,          r3, g3, b3)
      gl.uniform2f(U.uMouse,           curX, curY)
      gl.uniform1f(U.uMouseInfluence,  p.mouseInfluence)
      gl.uniform1f(U.uEnableMouse,     p.enableMouseInteraction ? 1.0 : 0.0)

      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    rafId = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(rafId)
      resizeObserver.disconnect()
      window.removeEventListener('mousemove',  onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      gl.deleteBuffer(posBuf)
      gl.deleteProgram(prog)
      const ext = gl.getExtension('WEBGL_lose_context')
      ext?.loseContext()
      if (canvas.parentNode === container) container.removeChild(canvas)
    }
  }, []) // runs once; live props read via propsRef every frame

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{
        position:      'absolute',
        inset:         0,
        width:         '100%',
        height:        '100%',
        pointerEvents: 'none',
        ...style,
      }}
    />
  )
}
