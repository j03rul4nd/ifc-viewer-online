/**
 * Pure rigid-fit for As-Built alignment (no three.js; worker-friendly).
 * Fits a rigid transform mapping cloud points -> model points (scene metres, Y-up).
 * 6-DOF uses Horn's quaternion method (4x4 symmetric eigenproblem via Jacobi), which
 * always yields a proper rotation (det = +1), so reflections cannot occur.
 * 4-DOF is yaw about +Y plus translation (closed form).
 */
export type Vec3 = [number, number, number];
export interface PointPair { model: Vec3; cloud: Vec3 }
export type FitMode = '4dof' | '6dof';

export interface FitResult {
  /** Row-major 3x3 rotation (cloud -> model). */
  rotation: number[];
  translation: Vec3;
  yawRad: number;
  residualsM: number[];
  fitRmseM: number;
  /** Leave-one-out RMSE; null when n < 4. */
  looRmseM: number | null;
  /** max(fitRmse, looRmse), or fitRmse when LOO is unavailable. */
  alignmentRmseM: number;
}
export interface FitError { error: 'too-few' | 'degenerate'; detail: string }

export const MIN_PAIRS = 3;
export const MIN_SPAN_M = 1;
const MIN_PERP_RMS_M = 0.01;

/** Jacobi eigen-decomposition of a symmetric n x n matrix (row-major). Eigenvectors are columns. */
export function jacobiEigen(a: number[], n: number): { values: number[]; vectors: number[] } {
  const A = a.slice();
  const V = new Array<number>(n * n).fill(0);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    let diag = 0;
    for (let p = 0; p < n; p++) {
      diag += A[p * n + p] ** 2;
      for (let q = p + 1; q < n; q++) off += A[p * n + q] ** 2;
    }
    if (off <= 1e-28 * Math.max(diag, 1e-300)) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (apq === 0) continue;
        const theta = (A[q * n + q] - A[p * n + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p], akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k], aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p], vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values: number[] = [];
  for (let i = 0; i < n; i++) values.push(A[i * n + i]);
  return { values, vectors: V };
}

function centroid(pts: Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
}

function applyR(R: number[], v: Vec3): Vec3 {
  return [
    R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
    R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
    R[6] * v[0] + R[7] * v[1] + R[8] * v[2],
  ];
}

/** Reason string if the point set cannot constrain a rigid fit, else null. */
function degeneracy(pts: Vec3[]): string | null {
  let span = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      span = Math.max(span, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]));
    }
  }
  if (span < MIN_SPAN_M) return `span ${span.toFixed(3)} m < ${MIN_SPAN_M} m`;
  const c = centroid(pts);
  const C = new Array<number>(9).fill(0);
  for (const p of pts) {
    const d = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] += d[i] * d[j];
  }
  const ev = jacobiEigen(C, 3).values.sort((a, b) => b - a);
  const perpRms = Math.sqrt(Math.max(0, ev[1]) / pts.length);
  if (perpRms < MIN_PERP_RMS_M) return 'points are collinear';
  return null;
}

function solve(pairs: PointPair[], mode: FitMode): { R: number[]; t: Vec3 } {
  const cm = centroid(pairs.map((p) => p.model));
  const cc = centroid(pairs.map((p) => p.cloud));
  let R: number[];
  if (mode === '4dof') {
    // R_y(th) = [c 0 s; 0 1 0; -s 0 c]; maximise sum m . R c over xz.
    let A = 0, B = 0;
    for (const { model, cloud } of pairs) {
      const mx = model[0] - cm[0], mz = model[2] - cm[2];
      const cx = cloud[0] - cc[0], cz = cloud[2] - cc[2];
      A += mx * cx + mz * cz;
      B += mx * cz - mz * cx;
    }
    const th = Math.atan2(B, A);
    const c = Math.cos(th), s = Math.sin(th);
    R = [c, 0, s, 0, 1, 0, -s, 0, c];
  } else {
    // Horn: S = sum (cloud_c)(model_c)^T
    const S = new Array<number>(9).fill(0);
    for (const { model, cloud } of pairs) {
      const a = [cloud[0] - cc[0], cloud[1] - cc[1], cloud[2] - cc[2]];
      const b = [model[0] - cm[0], model[1] - cm[1], model[2] - cm[2]];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i * 3 + j] += a[i] * b[j];
    }
    const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = S;
    const N = [
      Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx,
      Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz,
      Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy,
      Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz,
    ];
    const { values, vectors } = jacobiEigen(N, 4);
    let best = 0;
    for (let i = 1; i < 4; i++) if (values[i] > values[best]) best = i;
    let w = vectors[best], x = vectors[4 + best], y = vectors[8 + best], z = vectors[12 + best];
    const qn = Math.hypot(w, x, y, z);
    w /= qn; x /= qn; y /= qn; z /= qn;
    R = [
      w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z,
    ];
  }
  const rc = applyR(R, cc);
  return { R, t: [cm[0] - rc[0], cm[1] - rc[1], cm[2] - rc[2]] };
}

function residual(R: number[], t: Vec3, p: PointPair): number {
  const q = applyR(R, p.cloud);
  return Math.hypot(q[0] + t[0] - p.model[0], q[1] + t[1] - p.model[1], q[2] + t[2] - p.model[2]);
}

const rms = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

/** Fit the cloud -> model rigid transform from >= 3 pairs. */
export function fitRigid(pairs: PointPair[], mode: FitMode): FitResult | FitError {
  if (pairs.length < MIN_PAIRS) {
    return { error: 'too-few', detail: `need >= ${MIN_PAIRS} pairs, got ${pairs.length}` };
  }
  const deg = degeneracy(pairs.map((p) => p.model)) ?? degeneracy(pairs.map((p) => p.cloud));
  if (deg) return { error: 'degenerate', detail: deg };
  const { R, t } = solve(pairs, mode);
  const residualsM = pairs.map((p) => residual(R, t, p));
  const fitRmseM = rms(residualsM);
  let looRmseM: number | null = null;
  if (pairs.length >= 4) {
    const loo = pairs.map((p, i) => {
      const f = solve(pairs.filter((_, j) => j !== i), mode);
      return residual(f.R, f.t, p);
    });
    looRmseM = rms(loo);
  }
  return {
    rotation: R,
    translation: t,
    yawRad: Math.atan2(R[2], R[0]),
    residualsM,
    fitRmseM,
    looRmseM,
    alignmentRmseM: looRmseM === null ? fitRmseM : Math.max(fitRmseM, looRmseM),
  };
}

export function isFitError(r: FitResult | FitError): r is FitError {
  return 'error' in r;
}

/** tau = sqrt(declared^2 + measurement^2 + rmse^2). */
export function effectiveTolerance(o: { declaredM: number; measurementM: number; alignmentRmseM: number }): number {
  return Math.sqrt(o.declaredM ** 2 + o.measurementM ** 2 + o.alignmentRmseM ** 2);
}

/** Scoring allowed iff declared tolerance >= 2 * alignment RMSE. */
export function scoringGate(o: { declaredM: number; alignmentRmseM: number }): { ok: boolean; reason?: 'alignment-too-coarse' } {
  return o.declaredM >= 2 * o.alignmentRmseM ? { ok: true } : { ok: false, reason: 'alignment-too-coarse' };
}

/** Indices of pairs whose residual exceeds 3 * rmse. */
export function suspiciousPairs(residuals: number[], rmse: number): number[] {
  const out: number[] = [];
  residuals.forEach((r, i) => { if (r > 3 * rmse) out.push(i); });
  return out;
}
