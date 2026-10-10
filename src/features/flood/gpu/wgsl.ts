// ─── WGSL kernels of the local-inertial solver ───────────────────────────────
// A line-by-line port of core/cpu-inertial.ts — read that file for the scheme.
// One time step is five dispatches in one compute pass (WebGPU orders them and
// makes each one's writes visible to the next):
//
//   k_dt     1 thread   the step, from the max depth the last k_cont left, in
//                       whole ms (clamped to the rain interval and the stop
//                       time); advances the clock. No CPU round trip.
//   k_flux   per face   new face discharges into q (from qIn) — ping-pong.
//   k_limit  per cell   outflow limiter factor → cells.w
//   k_scale  per face   q *= factor of its donor; boundary outflow → bnd
//   k_cont   per cell   continuity, velocities, maxima, max depth (reduced per
//                       workgroup first: one global atomic per 256 cells, not one
//                       per cell — a single contended address serialises).
//
// Steps past the stop time come out with dt = 0 and change nothing, so a batch
// can be recorded with a fixed number of steps and the CPU never waits on the
// GPU in the middle of it.
//
// Storage buffers per pipeline: 7 (ctrl, cells, qIn, q, maxima, boundary,
// infiltration) —
// under the default limit of 8, so no adapter needs raised limits. The static
// fields (z, rainFactor, n, blocked) are a texture for the same reason.

const PARAMS = /* wgsl */`
struct Params {
  nx: u32, ny: u32, edges: u32, rainCount: u32,
  rainIntervalMs: u32, implicitFriction: u32, pad0: u32, pad1: u32,
  dx: f32, g: f32, theta: f32, alpha: f32,
  hEps: f32, dtMax: f32, freeSlopeMin: f32, wetThreshold: f32,
  infInitial: f32, infFinal: f32, infDecay: f32, pad2: f32,
};
`

export const PARAMS_BYTES = 80
export const RAIN_SLOTS = 4096 // vec4 × 1024 = 16 KiB of uniform
export const CTRL_BYTES = 32

export const STEP_WGSL = /* wgsl */`
${PARAMS}
struct Ctrl {
  tMs: u32, tStopMs: u32, dtMs: u32, steps: u32,
  dt: f32, rate: f32, hmaxBits: atomic<u32>, pad: u32,
};

@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<uniform> RAIN: array<vec4f, 1024>;
@group(0) @binding(2) var ST: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> C: Ctrl;
@group(0) @binding(4) var<storage, read_write> cells: array<vec4f>;
@group(0) @binding(5) var<storage, read> qIn: array<vec2f>;
@group(0) @binding(6) var<storage, read_write> q: array<vec2f>;
@group(0) @binding(7) var<storage, read_write> mx: array<vec4f>;
@group(0) @binding(8) var<storage, read_write> bnd: array<f32>;
@group(0) @binding(9) var<storage, read_write> inf: array<f32>;

const H_FLOOR: f32 = 1e-6;

// Horton, from the step's start time (s): m/s.
fn infiltrationRate(tS: f32) -> f32 {
  let f = P.infFinal + (P.infInitial - P.infFinal) * exp(-P.infDecay * tS / 3600.0);
  return max(f, 0.0) / 3600000.0;
}

fn st(i: u32, j: u32) -> vec4f { return textureLoad(ST, vec2u(i, j), 0); }
fn hAt(i: u32, j: u32) -> f32 { return cells[j * P.nx + i].x; }
fn rainAt(idx: u32) -> f32 { return RAIN[idx >> 2u][idx & 3u]; }

// q⁺·(1 + a·|q⁺|) = b (implicit) or q⁺ = b / (1 + a·|q_old|) (Bates).
fn friction(b: f32, a: f32, qOld: f32) -> f32 {
  if (P.implicitFriction != 0u) { return 2.0 * b / (1.0 + sqrt(1.0 + 4.0 * a * abs(b))); }
  return b / (1.0 + a * abs(qOld));
}

@compute @workgroup_size(1)
fn k_dt() {
  let t = C.tMs;
  var d: u32 = 0u;
  if (C.tStopMs > t) {
    let hm = bitcast<f32>(atomicLoad(&C.hmaxBits));
    let cfl = P.alpha * P.dx / sqrt(P.g * max(hm, H_FLOOR));
    d = max(1u, u32(floor(min(cfl, P.dtMax) * 1000.0)));
    d = min(d, C.tStopMs - t);
    let idx = t / P.rainIntervalMs;
    if (idx < P.rainCount) { d = min(d, (idx + 1u) * P.rainIntervalMs - t); }
  }
  let idx = t / P.rainIntervalMs;
  var rate = 0.0;
  if (d > 0u && idx < P.rainCount) { rate = rainAt(idx); }
  C.dtMs = d;
  C.dt = f32(d) * 0.001;
  C.rate = rate;
  if (d > 0u) {
    atomicStore(&C.hmaxBits, 0u);
    C.tMs = t + d;
    C.steps = C.steps + 1u;
  }
}

fn edgeFlux(h: f32, zc: f32, zInner: f32, hasInner: bool, n: f32, qOld: f32, sgn: f32, dt: f32) -> f32 {
  if (h <= P.hEps) { return 0.0; }
  var slope = P.freeSlopeMin;
  if (hasInner) { slope = max((zInner - zc) / P.dx, P.freeSlopeMin); }
  let qo = max(sgn * qOld, 0.0);
  let a = P.g * dt * n * n / pow(h, 7.0 / 3.0);
  return sgn * friction(qo + P.g * h * dt * slope, a, qo);
}

fn faceFlux(sa: vec4f, sb: vec4f, ha: f32, hb: f32, qOld: f32, qPrev: f32, qNext: f32, dt: f32) -> f32 {
  if (sa.w > 0.5 || sb.w > 0.5) { return 0.0; }
  let ea = sa.x + ha;
  let eb = sb.x + hb;
  let hf = max(ea, eb) - max(sa.x, sb.x);
  if (hf <= P.hEps) { return 0.0; }
  let qBar = P.theta * qOld + (1.0 - P.theta) * 0.5 * (qPrev + qNext);
  let n = 0.5 * (sa.z + sb.z);
  let a = P.g * dt * n * n / pow(hf, 7.0 / 3.0);
  return friction(qBar - P.g * hf * dt * (eb - ea) / P.dx, a, qOld);
}

@compute @workgroup_size(16, 16)
fn k_flux(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let j = id.y;
  if (i > P.nx || j > P.ny) { return; }
  let W = P.nx + 1u;
  let f = j * W + i;
  let old = qIn[f];
  let dt = C.dt;
  if (dt <= 0.0) { q[f] = old; return; }
  var r = vec2f(0.0, 0.0);
  if (j < P.ny) {
    if (i == 0u || i == P.nx) {
      let west = i == 0u;
      if ((P.edges & select(2u, 1u, west)) != 0u) {
        let ci = select(P.nx - 1u, 0u, west);
        let s = st(ci, j);
        if (s.w < 0.5) {
          var zi = 0.0;
          if (P.nx >= 2u) { zi = st(select(P.nx - 2u, 1u, west), j).x; }
          r.x = edgeFlux(hAt(ci, j), s.x, zi, P.nx >= 2u, s.z, old.x, select(1.0, -1.0, west), dt);
        }
      }
    } else {
      r.x = faceFlux(st(i - 1u, j), st(i, j), hAt(i - 1u, j), hAt(i, j), old.x, qIn[f - 1u].x, qIn[f + 1u].x, dt);
    }
  }
  if (i < P.nx) {
    if (j == 0u || j == P.ny) {
      let south = j == 0u;
      if ((P.edges & select(8u, 4u, south)) != 0u) {
        let cj = select(P.ny - 1u, 0u, south);
        let s = st(i, cj);
        if (s.w < 0.5) {
          var zi = 0.0;
          if (P.ny >= 2u) { zi = st(i, select(P.ny - 2u, 1u, south)).x; }
          r.y = edgeFlux(hAt(i, cj), s.x, zi, P.ny >= 2u, s.z, old.y, select(1.0, -1.0, south), dt);
        }
      }
    } else {
      r.y = faceFlux(st(i, j - 1u), st(i, j), hAt(i, j - 1u), hAt(i, j), old.y, qIn[f - W].y, qIn[f + W].y, dt);
    }
  }
  q[f] = r;
}

@compute @workgroup_size(16, 16)
fn k_limit(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let j = id.y;
  if (i >= P.nx || j >= P.ny) { return; }
  let dt = C.dt;
  if (dt <= 0.0) { return; }
  let W = P.nx + 1u;
  let f = j * W + i;
  let c = j * P.nx + i;
  let k = dt / P.dx;
  let out = (max(-q[f].x, 0.0) + max(q[f + 1u].x, 0.0) + max(-q[f].y, 0.0) + max(q[f + W].y, 0.0)) * k;
  var cell = cells[c];
  cell.w = select(1.0, cell.x / out, out > cell.x);
  cells[c] = cell;
}

@compute @workgroup_size(16, 16)
fn k_scale(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  let j = id.y;
  if (i > P.nx || j > P.ny) { return; }
  let dt = C.dt;
  if (dt <= 0.0) { return; }
  let W = P.nx + 1u;
  let f = j * W + i;
  var v = q[f];
  if (j < P.ny && v.x != 0.0) {
    var fac = 0.0;
    if (v.x > 0.0) {
      if (i > 0u) { fac = cells[j * P.nx + i - 1u].w; }
    } else {
      if (i < P.nx) { fac = cells[j * P.nx + i].w; }
    }
    v.x = v.x * fac;
    if (i == 0u) { bnd[j] += abs(v.x) * dt * P.dx; }
    if (i == P.nx) { bnd[P.ny + j] += abs(v.x) * dt * P.dx; }
  }
  if (i < P.nx && v.y != 0.0) {
    var fac = 0.0;
    if (v.y > 0.0) {
      if (j > 0u) { fac = cells[(j - 1u) * P.nx + i].w; }
    } else {
      if (j < P.ny) { fac = cells[j * P.nx + i].w; }
    }
    v.y = v.y * fac;
    if (j == 0u) { bnd[2u * P.ny + i] += abs(v.y) * dt * P.dx; }
    if (j == P.ny) { bnd[2u * P.ny + P.nx + i] += abs(v.y) * dt * P.dx; }
  }
  q[f] = v;
}

var<workgroup> wmax: atomic<u32>;

@compute @workgroup_size(16, 16)
fn k_cont(@builtin(global_invocation_id) id: vec3u, @builtin(local_invocation_index) li: u32) {
  if (li == 0u) { atomicStore(&wmax, 0u); }
  workgroupBarrier();
  let i = id.x;
  let j = id.y;
  let dt = C.dt;
  var hn = 0.0;
  if (i < P.nx && j < P.ny && dt > 0.0) {
    let c = j * P.nx + i;
    let s = st(i, j);
    if (s.w < 0.5) {
      let W = P.nx + 1u;
      let f = j * W + i;
      let qL = q[f].x;
      let qR = q[f + 1u].x;
      let qB = q[f].y;
      let qT = q[f + W].y;
      let cell = cells[c];
      let k = dt / P.dx;
      hn = max(cell.x + k * (qL - qR + qB - qT) + dt * C.rate * s.y, 0.0);
      let loss = min(hn, infiltrationRate(f32(C.tMs - C.dtMs) * 0.001) * dt);
      if (loss > 0.0) {
        hn = hn - loss;
        inf[c] = inf[c] + loss;
      }
      var u = 0.0;
      var v = 0.0;
      if (hn > P.hEps) {
        u = 0.5 * (qL + qR) / hn;
        v = 0.5 * (qB + qT) / hn;
      }
      cells[c] = vec4f(hn, u, v, cell.w);
      var m = mx[c];
      let tEnd = f32(C.tMs) * 0.001;
      if (hn > m.x) { m.x = hn; m.z = tEnd; }
      if (hn > P.wetThreshold) {
        m.y = max(m.y, length(vec2f(u, v)));
        if (m.w < 0.0) { m.w = tEnd; }
      }
      mx[c] = m;
    }
  }
  atomicMax(&wmax, bitcast<u32>(hn));
  workgroupBarrier();
  if (li == 0u) { atomicMax(&C.hmaxBits, atomicLoad(&wmax)); }
}
`

export const IO_WGSL = /* wgsl */`
${PARAMS}
@group(0) @binding(0) var<uniform> P: Params;
@group(0) @binding(1) var<storage, read> cells: array<vec4f>;
@group(0) @binding(2) var<storage, read> mx: array<vec4f>;
@group(0) @binding(3) var<storage, read_write> partials: array<vec4f>;
@group(0) @binding(4) var<storage, read_write> disp: array<vec2u>;
@group(0) @binding(5) var<storage, read> inf: array<f32>;

var<workgroup> red: array<vec4f, 256>;
var<workgroup> redInf: array<f32, 256>;

fn flat(wg: vec3u, nwg: vec3u, li: u32) -> u32 { return (wg.y * nwg.x + wg.x) * 256u + li; }

// Per workgroup of 256 cells: (Σh, wet cells, max h, max speed of wet cells)
// and (Σ infiltrated depth, 0, 0, 0) — two vec4 per workgroup.
@compute @workgroup_size(256)
fn k_stats(@builtin(workgroup_id) wg: vec3u, @builtin(num_workgroups) nwg: vec3u, @builtin(local_invocation_index) li: u32) {
  let gidx = flat(wg, nwg, li);
  var v = vec4f(0.0);
  var d = 0.0;
  if (gidx < P.nx * P.ny) {
    let c = cells[gidx];
    let wet = c.x > P.wetThreshold;
    v = vec4f(c.x, select(0.0, 1.0, wet), c.x, select(0.0, length(c.yz), wet));
    d = inf[gidx];
  }
  red[li] = v;
  redInf[li] = d;
  workgroupBarrier();
  for (var s = 128u; s > 0u; s = s >> 1u) {
    if (li < s) {
      let a = red[li];
      let b = red[li + s];
      red[li] = vec4f(a.x + b.x, a.y + b.y, max(a.z, b.z), max(a.w, b.w));
      redInf[li] = redInf[li] + redInf[li + s];
    }
    workgroupBarrier();
  }
  if (li == 0u) {
    let w = wg.y * nwg.x + wg.x;
    partials[w * 2u] = red[0];
    partials[w * 2u + 1u] = vec4f(redInf[0], 0.0, 0.0, 0.0);
  }
}

// Display frame: (h, u) and (v, hMax) as half floats.
@compute @workgroup_size(256)
fn k_pack(@builtin(workgroup_id) wg: vec3u, @builtin(num_workgroups) nwg: vec3u, @builtin(local_invocation_index) li: u32) {
  let gidx = flat(wg, nwg, li);
  if (gidx >= P.nx * P.ny) { return; }
  let c = clamp(cells[gidx], vec4f(-65000.0), vec4f(65000.0));
  let m = clamp(mx[gidx].x, 0.0, 65000.0);
  disp[gidx] = vec2u(pack2x16float(c.xy), pack2x16float(vec2f(c.z, m)));
}
`
