// ─── scene-link ───────────────────────────────────────────────────────────────
// A scene that travels INSIDE its link, for when there is nowhere to host the
// JSON: `#scene=<deflate-raw, base64url>`. The fragment never reaches a server
// (ours included), so sharing a scene this way publishes nothing anywhere.
//
// Links have practical limits — chat apps and some browsers truncate around
// 8–32 KB. A scene with a few models and a dozen layers by URL compresses to
// 1–3 KB; layers carried inline (a dropped GeoJSON file) do not belong in a
// link, and `encodeSceneLink` refuses past MAX_LINK_CHARS rather than produce
// a link that silently breaks.

import type { SceneDoc } from './scene-doc'

export const MAX_LINK_CHARS = 16_000

function toBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const source = new ReadableStream<Uint8Array>({ start(c) { c.enqueue(bytes); c.close() } })
  const reader = source.pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>).getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.length
  }
  const out = new Uint8Array(size)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

/** The scene as a fragment value, or null when it would be too long for a link. */
export async function encodeSceneLink(doc: SceneDoc): Promise<string | null> {
  const packed = await pipe(new TextEncoder().encode(JSON.stringify(doc)), new CompressionStream('deflate-raw'))
  const s = toBase64Url(packed)
  return s.length <= MAX_LINK_CHARS ? s : null
}

/** A fragment value back to the scene's JSON text (validation is the caller's). */
export async function decodeSceneLink(value: string): Promise<string> {
  const bytes = await pipe(fromBase64Url(value.trim()), new DecompressionStream('deflate-raw'))
  return new TextDecoder().decode(bytes)
}

/** `#scene=…` from a location hash, or null. */
export function sceneLinkValue(hash: string): string | null {
  const m = /(?:^#|&)scene=([A-Za-z0-9_-]+)/.exec(hash)
  return m ? m[1] : null
}
