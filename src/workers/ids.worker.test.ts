// ─── ids.worker message-handling tests ────────────────────────────────────────
// The worker's contract is that every `check-ids` gets exactly one reply. The
// main thread has no other way to learn what happened: an unhandled rejection
// inside a worker does not fire worker.onerror, so a dropped message shows up as
// 120 s of spinner followed by `timeout` — an error code that blames the model
// for a bug in here.
//
// Only the paths that reply BEFORE any WASM work are exercised: the worker is a
// module worker, and driving a real check would need web-ifc's runtime inside
// jsdom. `self` in jsdom is the window, so importing the module installs its
// onmessage handler on it and messages can be dispatched by hand.

import { describe, it, expect, beforeAll, vi } from 'vitest'
import type { IdsDocument } from '../lib/ids/ids-types'

const posted: Array<{ type: string; id?: string; code?: string; message?: string }> = []

const DOC: IdsDocument = {
  title: 'T',
  specifications: [{ name: 'spec', applicability: [], requirements: [] }],
}

/** Hand the worker one message, as the runner's postMessage would. */
function send(data: unknown): void {
  const handler = (self as unknown as { onmessage: ((e: MessageEvent) => void) | null }).onmessage
  if (!handler) throw new Error('worker did not install an onmessage handler')
  handler({ data } as MessageEvent)
}

beforeAll(async () => {
  vi.stubGlobal('postMessage', (m: unknown) => { posted.push(m as { type: string }) })
  await import('./ids.worker')
})

describe('ids.worker inbound message handling', () => {
  it('answers a check-ids the schema rejects, naming the reason', () => {
    posted.length = 0
    // A document with zero specifications reaches the worker for real: an EIR
    // profile compiles `ignored` rules away, and every-rule-ignored compiles to
    // an empty document that IdsDocumentSchema refuses.
    send({ type: 'check-ids', id: 'run-1', buffer: new ArrayBuffer(8), doc: { specifications: [] } })

    expect(posted).toHaveLength(1)
    expect(posted[0]).toMatchObject({ type: 'error', id: 'run-1', code: 'unknown' })
    // The panel renders this string verbatim. "Invalid payload" is not something
    // a user can act on; the failing field is.
    expect(posted[0].message).toBeTruthy()
    expect(posted[0].message).not.toBe('Invalid check-ids payload')
  })

  it('answers a check-ids whose buffer never arrived', () => {
    posted.length = 0
    send({ type: 'check-ids', id: 'run-2', doc: DOC })
    expect(posted).toMatchObject([{ type: 'error', id: 'run-2', code: 'unknown' }])
  })

  it('stays quiet for messages nobody is waiting on', () => {
    posted.length = 0
    send({ type: 'cancel', id: 'run-3' })          // cancel needs no confirmation
    send({ type: 'nonsense' })                      // no id → nothing to answer
    send({ type: 'check-ids', doc: DOC })           // no id → nothing to answer
    send(null)
    expect(posted).toEqual([])
  })

  it('answers a second check instead of dropping it', async () => {
    posted.length = 0
    // The first check latches `checkStarted` and goes off to do WASM work whose
    // replies are irrelevant here; only the SECOND check's reply is asserted.
    send({ type: 'check-ids', id: 'run-4', buffer: new ArrayBuffer(8), doc: DOC })
    posted.length = 0
    send({ type: 'check-ids', id: 'run-5', buffer: new ArrayBuffer(8), doc: DOC })

    const reply = posted.find((m) => m.id === 'run-5')
    expect(reply, 'a worker that will never run this check must say so').toMatchObject({
      type: 'error', id: 'run-5', code: 'unknown',
    })

    // …and the first check must not be left unanswered either. It cannot succeed
    // here (no WASM under jsdom), so this settles on the init or open failure —
    // which is the point: whichever way runCheck goes, it terminates in a reply
    // rather than in an unhandled rejection the main thread cannot observe.
    for (let i = 0; i < 50 && !posted.some((m) => m.id === 'run-4' && m.type !== 'progress'); i++) {
      await new Promise((r) => setTimeout(r, 20))
    }
    expect(posted.find((m) => m.id === 'run-4' && m.type !== 'progress')).toMatchObject({ type: 'error', id: 'run-4' })
  })
})
