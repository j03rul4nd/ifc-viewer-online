// ─── GLSL ES 3.00 passes of the local-inertial solver (WebGL2 fallback) ──────
// The same step as wgsl.ts / core/cpu-inertial.ts, expressed as full-screen
// fragment passes over float textures (one texel = one cell or one face). A
// pass cannot read the texture it writes, so state ping-pongs; the clock and
// the step live in a 1×1 RGBA32UI texture (tMs, dtMs, steps, rate bits) that
// every pass samples — the CPU still never reads anything mid-batch.
//
// Per step: dt → flux → limit → scale → boundary → continuity (two outputs) →
// max-depth reduction (4×4 per level down to 1×1).

export const VS = /* glsl */`#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

const HEAD = /* glsl */`#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
`

const COMMON = /* glsl */`
uniform sampler2D uStatic;   // (z, rainFactor, n, blocked)
uniform highp usampler2D uCtrl;
uniform int uNx;
uniform int uNy;
uniform float uDx;
uniform float uG;
uniform float uHEps;
vec4 st(int i, int j) { return texelFetch(uStatic, ivec2(i, j), 0); }
float stepDt() { return float(texelFetch(uCtrl, ivec2(0), 0).y) * 0.001; }
`

export const FS_DT = HEAD + /* glsl */`
uniform highp usampler2D uCtrl;
uniform sampler2D uHmax;
uniform sampler2D uRain;
uniform uint uTStop;
uniform uint uRainIv;
uniform uint uRainCount;
uniform int uRainW;
uniform float uAlpha;
uniform float uDx;
uniform float uG;
uniform float uDtMax;
out uvec4 o;
void main() {
  uvec4 c = texelFetch(uCtrl, ivec2(0), 0);
  uint t = c.x;
  uint d = 0u;
  if (uTStop > t) {
    float hm = texelFetch(uHmax, ivec2(0), 0).x;
    float cfl = uAlpha * uDx / sqrt(uG * max(hm, 1e-6));
    d = max(1u, uint(floor(min(cfl, uDtMax) * 1000.0)));
    d = min(d, uTStop - t);
    uint idx0 = t / uRainIv;
    if (idx0 < uRainCount) d = min(d, (idx0 + 1u) * uRainIv - t);
  }
  uint idx = t / uRainIv;
  float rate = 0.0;
  if (d > 0u && idx < uRainCount) rate = texelFetch(uRain, ivec2(int(idx) % uRainW, int(idx) / uRainW), 0).x;
  if (d > 0u) o = uvec4(t + d, d, c.z + 1u, floatBitsToUint(rate));
  else o = uvec4(t, 0u, c.z, 0u);
}
`

export const FS_FLUX = HEAD + COMMON + /* glsl */`
uniform sampler2D uQ;      // RG32F faces (qx west, qy south)
uniform sampler2D uCells;  // RGBA32F (h, u, v, -)
uniform uint uEdges;
uniform float uTheta;
uniform float uFreeSlopeMin;
uniform bool uImplicit;
out vec4 o;
float hAt(int i, int j) { return texelFetch(uCells, ivec2(i, j), 0).x; }
vec2 qAt(int i, int j) { return texelFetch(uQ, ivec2(i, j), 0).xy; }
float friction(float b, float a, float qOld) {
  if (uImplicit) return 2.0 * b / (1.0 + sqrt(1.0 + 4.0 * a * abs(b)));
  return b / (1.0 + a * abs(qOld));
}
float edgeFlux(float h, float zc, float zInner, bool hasInner, float n, float qOld, float sgn, float dt) {
  if (h <= uHEps) return 0.0;
  float slope = uFreeSlopeMin;
  if (hasInner) slope = max((zInner - zc) / uDx, uFreeSlopeMin);
  float qo = max(sgn * qOld, 0.0);
  float a = uG * dt * n * n / pow(h, 7.0 / 3.0);
  return sgn * friction(qo + uG * h * dt * slope, a, qo);
}
float faceFlux(vec4 sa, vec4 sb, float ha, float hb, float qOld, float qPrev, float qNext, float dt) {
  if (sa.w > 0.5 || sb.w > 0.5) return 0.0;
  float ea = sa.x + ha;
  float eb = sb.x + hb;
  float hf = max(ea, eb) - max(sa.x, sb.x);
  if (hf <= uHEps) return 0.0;
  float qBar = uTheta * qOld + (1.0 - uTheta) * 0.5 * (qPrev + qNext);
  float n = 0.5 * (sa.z + sb.z);
  float a = uG * dt * n * n / pow(hf, 7.0 / 3.0);
  return friction(qBar - uG * hf * dt * (eb - ea) / uDx, a, qOld);
}
void main() {
  int i = int(gl_FragCoord.x);
  int j = int(gl_FragCoord.y);
  vec2 old = qAt(i, j);
  float dt = stepDt();
  if (dt <= 0.0) { o = vec4(old, 0.0, 0.0); return; }
  vec2 r = vec2(0.0);
  if (j < uNy) {
    if (i == 0 || i == uNx) {
      bool west = i == 0;
      if ((uEdges & (west ? 1u : 2u)) != 0u) {
        int ci = west ? 0 : uNx - 1;
        vec4 s = st(ci, j);
        if (s.w < 0.5) {
          float zi = uNx >= 2 ? st(west ? 1 : uNx - 2, j).x : 0.0;
          r.x = edgeFlux(hAt(ci, j), s.x, zi, uNx >= 2, s.z, old.x, west ? -1.0 : 1.0, dt);
        }
      }
    } else {
      r.x = faceFlux(st(i - 1, j), st(i, j), hAt(i - 1, j), hAt(i, j), old.x, qAt(i - 1, j).x, qAt(i + 1, j).x, dt);
    }
  }
  if (i < uNx) {
    if (j == 0 || j == uNy) {
      bool south = j == 0;
      if ((uEdges & (south ? 4u : 8u)) != 0u) {
        int cj = south ? 0 : uNy - 1;
        vec4 s = st(i, cj);
        if (s.w < 0.5) {
          float zi = uNy >= 2 ? st(i, south ? 1 : uNy - 2).x : 0.0;
          r.y = edgeFlux(hAt(i, cj), s.x, zi, uNy >= 2, s.z, old.y, south ? -1.0 : 1.0, dt);
        }
      }
    } else {
      r.y = faceFlux(st(i, j - 1), st(i, j), hAt(i, j - 1), hAt(i, j), old.y, qAt(i, j - 1).y, qAt(i, j + 1).y, dt);
    }
  }
  o = vec4(r, 0.0, 0.0);
}
`

export const FS_LIMIT = HEAD + /* glsl */`
uniform highp usampler2D uCtrl;
uniform sampler2D uQ;
uniform sampler2D uCells;
uniform float uDx;
out vec4 o;
void main() {
  int i = int(gl_FragCoord.x);
  int j = int(gl_FragCoord.y);
  float dt = float(texelFetch(uCtrl, ivec2(0), 0).y) * 0.001;
  float h = texelFetch(uCells, ivec2(i, j), 0).x;
  vec2 q0 = texelFetch(uQ, ivec2(i, j), 0).xy;
  float qR = texelFetch(uQ, ivec2(i + 1, j), 0).x;
  float qT = texelFetch(uQ, ivec2(i, j + 1), 0).y;
  float k = dt / uDx;
  float outv = (max(-q0.x, 0.0) + max(qR, 0.0) + max(-q0.y, 0.0) + max(qT, 0.0)) * k;
  o = vec4(outv > h ? h / outv : 1.0, 0.0, 0.0, 0.0);
}
`

export const FS_SCALE = HEAD + /* glsl */`
uniform highp usampler2D uCtrl;
uniform sampler2D uQ;
uniform sampler2D uFactor;
uniform int uNx;
uniform int uNy;
out vec4 o;
float fac(int i, int j) { return texelFetch(uFactor, ivec2(i, j), 0).x; }
void main() {
  int i = int(gl_FragCoord.x);
  int j = int(gl_FragCoord.y);
  vec2 v = texelFetch(uQ, ivec2(i, j), 0).xy;
  float dt = float(texelFetch(uCtrl, ivec2(0), 0).y) * 0.001;
  if (dt > 0.0) {
    if (j < uNy && v.x != 0.0) v.x *= v.x > 0.0 ? (i > 0 ? fac(i - 1, j) : 0.0) : (i < uNx ? fac(i, j) : 0.0);
    if (i < uNx && v.y != 0.0) v.y *= v.y > 0.0 ? (j > 0 ? fac(i, j - 1) : 0.0) : (j < uNy ? fac(i, j) : 0.0);
  }
  o = vec4(v, 0.0, 0.0);
}
`

/** Boundary outflow accumulators: texel k → one boundary face (W, E, S, N). */
export const FS_BND = HEAD + /* glsl */`
uniform highp usampler2D uCtrl;
uniform sampler2D uQ;
uniform sampler2D uPrev;
uniform int uNx;
uniform int uNy;
uniform int uW;
uniform float uDx;
out vec4 o;
void main() {
  int k = int(gl_FragCoord.y) * uW + int(gl_FragCoord.x);
  float prev = texelFetch(uPrev, ivec2(gl_FragCoord.xy), 0).x;
  float dt = float(texelFetch(uCtrl, ivec2(0), 0).y) * 0.001;
  float q = 0.0;
  if (k < uNy) q = texelFetch(uQ, ivec2(0, k), 0).x;
  else if (k < 2 * uNy) q = texelFetch(uQ, ivec2(uNx, k - uNy), 0).x;
  else if (k < 2 * uNy + uNx) q = texelFetch(uQ, ivec2(k - 2 * uNy, 0), 0).y;
  else if (k < 2 * uNy + 2 * uNx) q = texelFetch(uQ, ivec2(k - 2 * uNy - uNx, uNy), 0).y;
  o = vec4(prev + (dt > 0.0 ? abs(q) * dt * uDx : 0.0), 0.0, 0.0, 0.0);
}
`

export const FS_CONT = HEAD + COMMON + /* glsl */`
uniform sampler2D uQ;
uniform sampler2D uCells;
uniform sampler2D uMax;
uniform float uWet;
layout(location = 0) out vec4 oCell;
layout(location = 1) out vec4 oMax;
void main() {
  int i = int(gl_FragCoord.x);
  int j = int(gl_FragCoord.y);
  vec4 cell = texelFetch(uCells, ivec2(i, j), 0);
  vec4 m = texelFetch(uMax, ivec2(i, j), 0);
  uvec4 c = texelFetch(uCtrl, ivec2(0), 0);
  float dt = float(c.y) * 0.001;
  vec4 s = st(i, j);
  if (dt <= 0.0 || s.w > 0.5) { oCell = cell; oMax = m; return; }
  float qL = texelFetch(uQ, ivec2(i, j), 0).x;
  float qR = texelFetch(uQ, ivec2(i + 1, j), 0).x;
  float qB = texelFetch(uQ, ivec2(i, j), 0).y;
  float qT = texelFetch(uQ, ivec2(i, j + 1), 0).y;
  float k = dt / uDx;
  float hn = max(cell.x + k * (qL - qR + qB - qT) + dt * uintBitsToFloat(c.w) * s.y, 0.0);
  float u = 0.0;
  float v = 0.0;
  if (hn > uHEps) { u = 0.5 * (qL + qR) / hn; v = 0.5 * (qB + qT) / hn; }
  float tEnd = float(c.x) * 0.001;
  if (hn > m.x) { m.x = hn; m.z = tEnd; }
  if (hn > uWet) {
    m.y = max(m.y, length(vec2(u, v)));
    if (m.w < 0.0) m.w = tEnd;
  }
  oCell = vec4(hn, u, v, 0.0);
  oMax = m;
}
`

/**
 * One reduction level: each output texel folds a 4×4 block of the source.
 * Mode 0 = max depth (source = cells, R channel); mode 1 = max of R (a previous
 * level); mode 2 = stats from cells (Σh, wet, max h, max wet speed); mode 3 =
 * stats from a previous level (sum, sum, max, max).
 */
export const FS_REDUCE = HEAD + /* glsl */`
uniform sampler2D uSrc;
uniform ivec2 uSrcSize;
uniform int uMode;
uniform float uWet;
out vec4 o;
void main() {
  ivec2 base = ivec2(gl_FragCoord.xy) * 4;
  vec4 acc = vec4(0.0);
  for (int dy = 0; dy < 4; dy++) {
    for (int dx = 0; dx < 4; dx++) {
      ivec2 p = base + ivec2(dx, dy);
      if (p.x >= uSrcSize.x || p.y >= uSrcSize.y) continue;
      vec4 t = texelFetch(uSrc, p, 0);
      if (uMode == 0) acc.x = max(acc.x, t.x);
      else if (uMode == 1) acc.x = max(acc.x, t.x);
      else if (uMode == 2) {
        bool wet = t.x > uWet;
        acc = vec4(acc.x + t.x, acc.y + (wet ? 1.0 : 0.0), max(acc.z, t.x), max(acc.w, wet ? length(t.yz) : 0.0));
      } else {
        acc = vec4(acc.x + t.x, acc.y + t.y, max(acc.z, t.z), max(acc.w, t.w));
      }
    }
  }
  o = acc;
}
`
