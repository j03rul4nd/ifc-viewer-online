// Synthetic scene for the §5 validation tests: axis-aligned boxes standing in
// for walls and columns, and a "capture" made by densely sampling their
// surfaces plus Gaussian noise. Test support only — not imported by the engine.

import { sampleSurface, seededRandom, type ElementGeometry } from './surface-sampling'

/** Closed box with outward (CCW from outside) triangles. */
export function boxGeometry(id: number, ifcClass: string, min: [number, number, number],
                            max: [number, number, number]): ElementGeometry {
  const [x0, y0, z0] = min, [x1, y1, z1] = max
  const positions = new Float32Array([
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1,
  ])
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2, // -z
    4, 5, 6, 4, 6, 7, // +z
    0, 1, 5, 0, 5, 4, // -y
    3, 7, 6, 3, 6, 2, // +y
    0, 4, 7, 0, 7, 3, // -x
    1, 2, 6, 1, 6, 5, // +x
  ])
  return { id, ifcClass, positions, indices }
}

export function translated(g: ElementGeometry, dx: number, dy: number, dz: number): ElementGeometry {
  return { ...g, matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, dx, dy, dz, 1] }
}

/** Four walls of a 6×6 m room (z up) plus four 0.3 m columns inside it. */
export function syntheticScene(): ElementGeometry[] {
  return [
    boxGeometry(1, 'IfcWall', [0, 0, 0], [6, 0.2, 3]),
    boxGeometry(2, 'IfcWall', [0, 5.8, 0], [6, 6, 3]),
    boxGeometry(3, 'IfcWall', [0, 0.2, 0], [0.2, 5.8, 3]),
    boxGeometry(4, 'IfcWall', [5.8, 0.2, 0], [6, 5.8, 3]),
    boxGeometry(11, 'IfcColumn', [1.5, 1.5, 0], [1.8, 1.8, 3]),
    boxGeometry(12, 'IfcColumn', [4.2, 1.5, 0], [4.5, 1.8, 3]),
    boxGeometry(13, 'IfcColumn', [1.5, 4.2, 0], [1.8, 4.5, 3]),
    boxGeometry(14, 'IfcColumn', [4.2, 4.2, 0], [4.5, 4.5, 3]),
  ]
}

/** Dense noisy "scan" of the given elements, one chunk per element. */
export function fakeCapture(elements: ElementGeometry[], densityPerM2 = 6000, noiseSigmaM = 0.003,
                            seed = 99): Float32Array[] {
  const rand = seededRandom(seed)
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand())
  return elements.map((g, i) => {
    const s = sampleSurface(g, { density: densityPerM2, minCount: 0, maxCount: Infinity, seed: seed * 1000 + i })
    for (let k = 0; k < s.positions.length; k++) s.positions[k] += gauss() * noiseSigmaM
    return s.positions
  })
}
