// ─── GIF export worker ─────────────────────────────────────────────────────────
// Encodes RGBA frames (streamed from the main thread) into an animated GIF with
// gifenc. No WASM, no DOM — pure JS quantization + LZW, which is exactly the
// CPU-heavy part that must stay off the main thread (D-23).
//
// Protocol (validated with Zod in both directions — see worker-schemas.ts):
//   IN : { type:'init', id, width, height, fps, totalFrames }
//        { type:'frame', id, index, buffer }   ← RGBA bytes, transferred
//        { type:'finish', id } | { type:'cancel', id }
//   OUT: { type:'progress', id, index, percent }  ← per-frame ack (backpressure)
//        { type:'done', id, buffer }               ← GIF bytes, transferred
//        { type:'error', id, message }

import { GIFEncoder, quantize, applyPalette, type GifEncoderInstance } from 'gifenc'
import { parseGifInMsg, type GifOutMsg } from '../lib/worker-schemas'

interface EncodeSession {
  id: string
  width: number
  height: number
  delayMs: number
  totalFrames: number
  encoded: number
  gif: GifEncoderInstance
}

let session: EncodeSession | null = null

function post(msg: GifOutMsg, transfer?: Transferable[]): void {
  // eslint-disable-next-line no-restricted-globals
  ;(self as unknown as Worker).postMessage(msg, transfer ?? [])
}

function fail(id: string, message: string): void {
  session = null
  post({ type: 'error', id, message })
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = parseGifInMsg(event.data)
  if (!parsed.ok) {
    const rawId = (event.data as { id?: unknown } | null)?.id
    fail(typeof rawId === 'string' ? rawId : 'unknown', parsed.error.message)
    return
  }
  const msg = parsed.data

  switch (msg.type) {
    case 'init': {
      session = {
        id:          msg.id,
        width:       msg.width,
        height:      msg.height,
        delayMs:     Math.max(20, Math.round(1000 / msg.fps)),
        totalFrames: msg.totalFrames,
        encoded:     0,
        gif:         GIFEncoder(),
      }
      return
    }

    case 'frame': {
      if (!session || session.id !== msg.id) {
        fail(msg.id, 'GIF worker received a frame without an active session')
        return
      }
      try {
        const rgba = new Uint8Array(msg.buffer)
        const expected = session.width * session.height * 4
        if (rgba.length !== expected) {
          fail(msg.id, `Frame ${msg.index} has ${rgba.length} bytes, expected ${expected}`)
          return
        }
        // Per-frame palette: costs a little size vs a global palette but keeps
        // memory flat (no two-pass buffering) and handles theme/overlay changes.
        const palette = quantize(rgba, 256, { format: 'rgb444' })
        const index = applyPalette(rgba, palette, 'rgb444')
        session.gif.writeFrame(index, session.width, session.height, {
          palette,
          delay: session.delayMs,
        })
        session.encoded++
        post({
          type:    'progress',
          id:      session.id,
          index:   msg.index,
          percent: Math.min(100, Math.round((session.encoded / session.totalFrames) * 100)),
        })
      } catch (err) {
        fail(msg.id, err instanceof Error ? err.message : 'GIF frame encode failed')
      }
      return
    }

    case 'finish': {
      if (!session || session.id !== msg.id) {
        fail(msg.id, 'GIF worker received finish without an active session')
        return
      }
      try {
        session.gif.finish()
        const bytes = session.gif.bytes()
        const out = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
        const id = session.id
        session = null
        post({ type: 'done', id, buffer: out }, [out])
      } catch (err) {
        fail(msg.id, err instanceof Error ? err.message : 'GIF finalize failed')
      }
      return
    }

    case 'cancel': {
      session = null
      return
    }
  }
}
