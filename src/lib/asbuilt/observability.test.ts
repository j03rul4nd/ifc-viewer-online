// ─── observability tests ──────────────────────────────────────────────────────
// The distinctions this module has to keep straight — seen / blocked / never
// looked at / looked through — are all invisible in a demo, because every one of
// them still renders a plausible cloud. So each test names the wrong product
// behaviour it prevents.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import {
  classifyObservability, observedFraction,
  type DepthFrame, type ElementSamples,
} from './observability'

const W = 64, H = 48

/**
 * A camera at `eye` looking at `target`, with a depth map that is a flat wall at
 * `wallDepth` metres along the optical axis.
 *
 * The pose is built with three.js and handed over as `.elements` precisely
 * because that is how the real worker will produce it — if the module's
 * column-major assumption were wrong, these tests would fail rather than the
 * product.
 */
function frame(eye: THREE.Vector3, target: THREE.Vector3, wallDepth: number): DepthFrame {
  const c2w = new THREE.Matrix4()
  const up = new THREE.Vector3(0, 0, 1)
  const forward = target.clone().sub(eye).normalize()
  const right = forward.clone().cross(up).normalize()
  const down = forward.clone().cross(right)          // OpenCV: +Y points down
  c2w.makeBasis(right, down, forward)
  c2w.setPosition(eye)

  const w2c = c2w.clone().invert()
  return {
    width: W, height: H,
    depth: new Float32Array(W * H).fill(wallDepth),
    fx: 50, fy: 50, cx: W / 2, cy: H / 2,
    w2c: w2c.elements,
  }
}

/**
 * One element sampled as a small patch around `centre`.
 *
 * The spread is deliberately perpendicular to the cameras' optical axis (+X
 * here): jittering along it would put samples at different ranges and mix
 * verdicts, so each test would be measuring the patch's thickness rather than
 * the behaviour it names.
 */
function samples(id: number, centre: [number, number, number], n = 40): ElementSamples {
  const positions = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const jitter = (i / n - 0.5) * 0.2
    positions[i * 3] = centre[0]
    positions[i * 3 + 1] = centre[1] + jitter
    positions[i * 3 + 2] = centre[2] + jitter * 0.5
  }
  return { id, positions }
}

/** Two cameras looking down +X from slightly different heights. */
function twoCameras(wallDepth: number): DepthFrame[] {
  return [
    frame(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), wallDepth),
    frame(new THREE.Vector3(0, 0, 0.1), new THREE.Vector3(1, 0, 0.1), wallDepth),
  ]
}

describe('the four verdicts', () => {
  it('sees an element sitting where the depth map says a surface is', () => {
    const obs = classifyObservability([samples(1, [5, 0, 0])], twoCameras(5))[0]
    expect(obs.state).toBe('observed')
    expect(obs.visible).toBe(obs.sampleCount)
    expect(obs.seenPast).toBe(0)
  })

  it('marks an element behind nearer geometry as occluded, never as missing', () => {
    // A column behind a parked van is still a column. Reporting it as absent
    // would put a fictional defect in front of a site manager.
    const obs = classifyObservability([samples(1, [8, 0, 0])], twoCameras(5))[0]
    expect(obs.state).toBe('occluded')
    expect(obs.occluded).toBe(obs.sampleCount)
    expect(obs.seenPast).toBe(0)
  })

  it('records seen-past when the cameras look straight through an element', () => {
    // The element should be at 3 m; both cameras report a surface at 5 m, so
    // there is nothing at 3 m. That is evidence of ABSENCE.
    const obs = classifyObservability([samples(1, [3, 0, 0])], twoCameras(5))[0]
    expect(obs.seenPast).toBe(obs.sampleCount)
    expect(obs.occluded).toBe(0)
    // ...and it must stay scoreable, or every unbuilt element escapes the score
    // by being filed as "we could not tell".
    expect(obs.state).toBe('observed')
  })

  it('marks an element outside the frustum as unobserved', () => {
    const obs = classifyObservability([samples(1, [0, 40, 0])], twoCameras(5))[0]
    expect(obs.state).toBe('unobserved')
    expect(obs.inFrustum).toBe(0)
  })

  it('marks an element behind the camera as unobserved', () => {
    const obs = classifyObservability([samples(1, [-5, 0, 0])], twoCameras(5))[0]
    expect(obs.state).toBe('unobserved')
    expect(obs.inFrustum).toBe(0)
  })
})

describe('back faces', () => {
  /** Same patch, with every normal pointing along `n`. */
  function facing(id: number, centre: [number, number, number], n: [number, number, number]) {
    const s = samples(id, centre)
    const count = s.positions.length / 3
    const normals = new Float32Array(s.positions.length)
    for (let i = 0; i < count; i++) {
      normals[i * 3] = n[0]; normals[i * 3 + 1] = n[1]; normals[i * 3 + 2] = n[2]
    }
    return { ...s, normals }
  }

  it('judges a surface turned towards the cameras', () => {
    // Cameras look along +X, so a surface whose normal is −X faces them.
    const obs = classifyObservability([facing(1, [5, 0, 0], [-1, 0, 0])], twoCameras(5))[0]
    expect(obs.testable).toBe(obs.sampleCount)
    expect(obs.state).toBe('observed')
  })

  it('excludes a surface no camera could ever face', () => {
    // This is the regression that measurement caught: without it the far face of
    // every wall counts as blocked, and a capture that saw all ten walls of the
    // synthetic room reported 0% coverage.
    const obs = classifyObservability([facing(1, [5, 0, 0], [1, 0, 0])], twoCameras(5))[0]
    expect(obs.testable).toBe(0)
    expect(obs.state).toBe('unobserved')
  })

  it('takes fractions over testable samples, not over every sample', () => {
    // Half the patch faces the cameras, half faces away. The half that faces
    // away must not dilute the verdict on the half that was clearly seen.
    const s = samples(1, [5, 0, 0])
    const count = s.positions.length / 3
    const normals = new Float32Array(s.positions.length)
    for (let i = 0; i < count; i++) normals[i * 3] = i < count / 2 ? -1 : 1
    const obs = classifyObservability([{ ...s, normals }], twoCameras(5))[0]

    expect(obs.testable).toBe(count / 2)
    expect(obs.visibleFraction).toBe(1)
    expect(obs.state).toBe('observed')
  })

  it('falls back to every sample when no normals are supplied', () => {
    const obs = classifyObservability([samples(1, [5, 0, 0])], twoCameras(5))[0]
    expect(obs.testable).toBe(obs.sampleCount)
  })
})

describe('holes in the depth map', () => {
  it('treats missing depth as no evidence, not as absence', () => {
    // Sky, glass and texture-less walls leave holes in every real depth map.
    // Reading a hole as "nothing is there" invents missing elements out of bad
    // lighting — the most damaging false positive this product can produce.
    const frames = twoCameras(5)
    for (const f of frames) f.depth.fill(0)
    const obs = classifyObservability([samples(1, [5, 0, 0])], frames)[0]
    expect(obs.seenPast).toBe(0)
    expect(obs.visible).toBe(0)
    expect(obs.state).toBe('unobserved')
  })
})

describe('witness threshold', () => {
  it('will not call a single camera enough by default', () => {
    const one = [frame(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), 5)]
    expect(classifyObservability([samples(1, [5, 0, 0])], one)[0].state).toBe('occluded')
    expect(classifyObservability([samples(1, [5, 0, 0])], one, { minWitnesses: 1 })[0].state)
      .toBe('observed')
  })
})

describe('depth agreement band', () => {
  it('accepts a sample inside the relative tolerance', () => {
    // 2% of 5 m is 100 mm, so a 40 mm discrepancy is agreement, not occlusion.
    const obs = classifyObservability([samples(1, [4.96, 0, 0])], twoCameras(5))[0]
    expect(obs.visible).toBe(obs.sampleCount)
  })

  it('rejects a sample outside it', () => {
    const obs = classifyObservability([samples(1, [4.5, 0, 0])], twoCameras(5))[0]
    expect(obs.visible).toBe(0)
    expect(obs.seenPast).toBe(obs.sampleCount)
  })
})

describe('coverage', () => {
  it('reports the fraction of the model the capture can judge', () => {
    const frames = twoCameras(5)
    const observations = classifyObservability([
      samples(1, [5, 0, 0]),        // observed
      samples(2, [5, 0.3, 0]),      // observed
      samples(3, [8, 0, 0]),        // occluded
      samples(4, [0, 40, 0]),       // unobserved
    ], frames)

    expect(observations.map((o) => o.state))
      .toEqual(['observed', 'observed', 'occluded', 'unobserved'])
    expect(observedFraction(observations)).toBeCloseTo(0.5)
  })

  it('an empty model is 0% covered', () => {
    expect(observedFraction([])).toBe(0)
  })

  it('a capture of nothing covers nothing', () => {
    // The floor the whole design rests on: filming the sky must not certify a
    // building.
    const observations = classifyObservability(
      [samples(1, [0, 40, 0]), samples(2, [0, -40, 0])], twoCameras(5))
    expect(observedFraction(observations)).toBe(0)
  })
})
