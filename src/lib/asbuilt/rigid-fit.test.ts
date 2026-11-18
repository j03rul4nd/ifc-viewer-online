import { describe, expect, it } from 'vitest';
import {
  effectiveTolerance,
  fitRigid,
  isFitError,
  scoringGate,
  suspiciousPairs,
  type FitResult,
  type PointPair,
  type Vec3,
} from './rigid-fit';

const deg = (d: number) => (d * Math.PI) / 180;

/** Row-major rotation R = Ry(yaw) * Rx(pitch) * Rz(roll). */
function rot(yaw: number, pitch = 0, roll = 0): number[] {
  const mul = (a: number[], b: number[]) => {
    const o = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) o[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
    return o;
  };
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp];
  const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1];
  return mul(Ry, mul(Rx, Rz));
}

const apply = (R: number[], t: Vec3, v: Vec3): Vec3 => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2] + t[0],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2] + t[1],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2] + t[2],
];

const CLOUD4: Vec3[] = [[0, 0, 0], [10, 0, 0], [0, 3, 8], [6, 2, 5]];
const CLOUD6: Vec3[] = [...CLOUD4, [-4, 1, 9], [7, 4, -6]];

function pairsFor(cloud: Vec3[], R: number[], t: Vec3, noise?: () => number): PointPair[] {
  return cloud.map((c) => {
    const m = apply(R, t, c);
    if (noise) { m[0] += noise(); m[1] += noise(); m[2] += noise(); }
    return { model: m, cloud: c };
  });
}

function ok(r: ReturnType<typeof fitRigid>): FitResult {
  if (isFitError(r)) throw new Error(r.detail);
  return r;
}

function det3(R: number[]) {
  return R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]);
}

/** Seeded Gaussian (mulberry32 + Box-Muller). */
function gauss(seed: number, sigma: number) {
  let s = seed >>> 0;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  return () => sigma * Math.sqrt(-2 * Math.log(u() || 1e-12)) * Math.cos(2 * Math.PI * u());
}

describe('fitRigid', () => {
  const t: Vec3 = [12, -3, 5];

  it.each(['4dof', '6dof'] as const)('recovers a known yaw 37 deg + translation exactly (%s)', (mode) => {
    const R = rot(deg(37));
    const f = ok(fitRigid(pairsFor(CLOUD4, R, t), mode));
    f.rotation.forEach((v, i) => expect(v).toBeCloseTo(R[i], 6));
    f.translation.forEach((v, i) => expect(v).toBeCloseTo(t[i], 6));
    expect(f.yawRad).toBeCloseTo(deg(37), 6);
    expect(f.fitRmseM).toBeLessThan(1e-6);
    expect(f.alignmentRmseM).toBeLessThan(1e-6);
  });

  it('6dof recovers pitch + roll + yaw; 4dof reports a higher RMSE', () => {
    const R = rot(deg(37), deg(5), deg(3));
    const pairs = pairsFor(CLOUD6, R, t);
    const f6 = ok(fitRigid(pairs, '6dof'));
    f6.rotation.forEach((v, i) => expect(v).toBeCloseTo(R[i], 6));
    f6.translation.forEach((v, i) => expect(v).toBeCloseTo(t[i], 6));
    expect(f6.fitRmseM).toBeLessThan(1e-6);
    const f4 = ok(fitRigid(pairs, '4dof'));
    expect(f4.fitRmseM).toBeGreaterThan(0.05);
  });

  // sigma = 5 mm as 3D point error (per-axis 5/sqrt(3) mm).
    it('noise sigma 5 mm on 6 pairs gives alignment RMSE in [2, 12] mm and LOO >= fit', () => {
    const R = rot(deg(37), deg(1), deg(-2));
    for (const seed of [1, 2, 3, 42]) {
      const f = ok(fitRigid(pairsFor(CLOUD6, R, t, gauss(seed, 0.005 / Math.sqrt(3))), '6dof'));
      expect(f.looRmseM).not.toBeNull();
      expect(f.looRmseM!).toBeGreaterThanOrEqual(f.fitRmseM);
      expect(f.alignmentRmseM).toBeGreaterThanOrEqual(0.002);
      expect(f.alignmentRmseM).toBeLessThanOrEqual(0.012);
    }
  });

  it('n = 3: no LOO, alignment RMSE = fit RMSE', () => {
    const f = ok(fitRigid(pairsFor(CLOUD4.slice(0, 3), rot(0.3), t, gauss(7, 0.005)), '6dof'));
    expect(f.looRmseM).toBeNull();
    expect(f.alignmentRmseM).toBe(f.fitRmseM);
  });

  it('n < 3 -> too-few', () => {
    const r = fitRigid(pairsFor(CLOUD4.slice(0, 2), rot(0), t), '6dof');
    expect(isFitError(r) && r.error).toBe('too-few');
  });

  it('collinear -> degenerate', () => {
    const line: Vec3[] = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [5, 5, 5]];
    const r = fitRigid(pairsFor(line, rot(0.2), t), '6dof');
    expect(isFitError(r) && r.error).toBe('degenerate');
  });

  it('span < 1 m -> degenerate', () => {
    const tiny: Vec3[] = [[0, 0, 0], [0.5, 0, 0], [0, 0.4, 0.3], [0.2, 0.1, 0.5]];
    const r = fitRigid(pairsFor(tiny, rot(0.2), t), '4dof');
    expect(isFitError(r) && r.error).toBe('degenerate');
  });

  it('mirrored data yields a proper rotation (det = +1)', () => {
    const mirror = [-1, 0, 0, 0, 1, 0, 0, 0, 1];
    const pairs = pairsFor(CLOUD6, mirror, [0, 0, 0]);
    const f = ok(fitRigid(pairs, '6dof'));
    expect(det3(f.rotation)).toBeCloseTo(1, 9);
    expect(f.fitRmseM).toBeGreaterThan(0.1);
  });
});

describe('tolerance helpers', () => {
  it('effectiveTolerance is the quadrature sum', () => {
    expect(effectiveTolerance({ declaredM: 0.025, measurementM: 0.005, alignmentRmseM: 0.01 }))
      .toBeCloseTo(Math.sqrt(0.025 ** 2 + 0.005 ** 2 + 0.01 ** 2), 12);
  });

  it('scoringGate: 25 mm vs 13 mm fails, vs 12 mm passes', () => {
    expect(scoringGate({ declaredM: 0.025, alignmentRmseM: 0.013, pairs: 4 })).toEqual({ ok: false, reason: 'alignment-too-coarse' });
    expect(scoringGate({ declaredM: 0.025, alignmentRmseM: 0.012, pairs: 4 }).ok).toBe(true);
  });

  it('scoringGate: 3 pairs may align but never score (D-AB3)', () => {
    expect(scoringGate({ declaredM: 1, alignmentRmseM: 0, pairs: 3 })).toEqual({ ok: false, reason: 'too-few-pairs-to-score' });
    expect(scoringGate({ declaredM: 1, alignmentRmseM: 0, pairs: 4 }).ok).toBe(true);
  });

  it('suspiciousPairs flags residuals > 3 rmse', () => {
    expect(suspiciousPairs([0.001, 0.002, 0.05, 0.003], 0.01)).toEqual([2]);
  });
});
