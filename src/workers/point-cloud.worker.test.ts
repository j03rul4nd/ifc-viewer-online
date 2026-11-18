// ─── point-cloud.worker message-handling tests ────────────────────────────────
// The worker's half of the budget hand-off: after its header, a whole-file
// parse PARKS until the runner grants a point budget, and stays cancellable
// while it does. Every runner test drives a FakeWorker whose behaviour the test
// author controls, so a regression here — a grant keyed by the wrong id, a park
// that is never resolved — would pass all of them and hang every whole-file
// load right after its header. This drives the real module instead.
//
// `self` in jsdom is the window, so importing the module installs its onmessage
// handler on it and messages can be dispatched by hand (as in ids.worker.test).
// An ASCII PLY needs no WASM, so the whole parse runs for real under jsdom.

import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { PointCloudWorkerOut } from '../lib/pointcloud/pc-types'

const posted: PointCloudWorkerOut[] = []

/** Hand the worker one message, as the runner's postMessage would. */
function send(data: unknown): void {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  if (!handler) throw new Error('worker did not install an onmessage handler')
  handler({ data } as MessageEvent)
}

/** A small ASCII PLY declaring `n` vertices. */
function ply(n: number): File {
  let text = `ply\nformat ascii 1.0\nelement vertex ${n}\n` +
    'property float x\nproperty float y\nproperty float z\nend_header\n'
  for (let i = 0; i < n; i++) text += `${i} ${i * 2} ${i % 3}\n`
  return new File([new TextEncoder().encode(text)], 'room.ply')
}

function parse(id: string, points: number): void {
  send({ type: 'parse', id, file: ply(points), format: 'ply', chunkPoints: 4096 })
}

const typesOf = (id: string): string[] => posted.filter((m) => m.id === id).map((m) => m.type)
const last = <T extends PointCloudWorkerOut['type']>(id: string, type: T): Extract<PointCloudWorkerOut, { type: T }> =>
  posted.filter((m) => m.id === id && m.type === type).pop() as Extract<PointCloudWorkerOut, { type: T }>

/** Let the reader's File slices and the parse's promise chain run. */
async function until(cond: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (cond()) return
    await new Promise((r) => setTimeout(r, 0))
  }
  throw new Error(`timed out waiting for ${what}`)
}
/** Long enough for a parse that WAS allowed to go on to post something. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0))
}

beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: unknown) => { posted.push(m as PointCloudWorkerOut) })
  await import('./point-cloud.worker')
})

describe('point-cloud.worker budget hand-off', () => {
  it('parks after the header, reads nothing until the budget arrives, then finishes', async () => {
    parse('p1', 5)
    await until(() => typesOf('p1').includes('header'), 'the header')
    await settle()
    // Parked: no chunk, no progress, no done — the budget may belong to another scan.
    expect(typesOf('p1')).toEqual(['header'])

    send({ type: 'budget', id: 'p1', maxPoints: 1_000 })
    await until(() => typesOf('p1').includes('done'), 'done')
    const types = typesOf('p1')
    expect(types.filter((t) => t === 'chunk').length).toBeGreaterThan(0)
    // Progress rides its own message now, ahead of the end, so a compact cloud
    // no longer sits at 0 % until its final flush.
    expect(types.indexOf('progress')).toBeGreaterThan(0)
    expect(types.indexOf('progress')).toBeLessThan(types.indexOf('done'))
    expect(last('p1', 'done')).toMatchObject({ pointCount: 5, truncated: false })
  })

  it('stays silent after a cancel while parked — even when a grant turns up late', async () => {
    parse('p2', 5)
    await until(() => typesOf('p2').includes('header'), 'the header')
    send({ type: 'cancel' })
    await settle()
    expect(typesOf('p2')).toEqual(['header'])

    send({ type: 'budget', id: 'p2', maxPoints: 1_000 })
    await settle()
    expect(typesOf('p2')).toEqual(['header'])
  })

  it('reads only what it was granted, and says the cloud is truncated', async () => {
    parse('p3', 5)
    await until(() => typesOf('p3').includes('header'), 'the header')
    send({ type: 'budget', id: 'p3', maxPoints: 2 })
    await until(() => typesOf('p3').includes('done'), 'done')
    expect(last('p3', 'done')).toMatchObject({ pointCount: 2, truncated: true })
  })

  it('lets a newer parse supersede one still parked on its budget', async () => {
    parse('p4', 5)
    await until(() => typesOf('p4').includes('header'), 'the first header')
    parse('p5', 3)
    await until(() => typesOf('p5').includes('header'), 'the second header')
    // A grant for the superseded parse must not revive it.
    send({ type: 'budget', id: 'p4', maxPoints: 1_000 })
    send({ type: 'budget', id: 'p5', maxPoints: 1_000 })
    await until(() => typesOf('p5').includes('done'), 'the newer parse to finish')
    expect(last('p5', 'done')).toMatchObject({ pointCount: 3, truncated: false })
    await settle()
    expect(typesOf('p4')).toEqual(['header'])
  })
})
