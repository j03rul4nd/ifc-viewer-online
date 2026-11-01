// ─── A sketch in a link ───────────────────────────────────────────────────────
// The active page, deflated, in the URL fragment: browsers never send a fragment
// to a server, ours included. Read-only for whoever opens it, and it needs no
// backend, which is also why it is a snapshot: it does not follow later changes.

import { activePage, parseDoc, serializeDoc } from './document'
import type { SketchDoc } from './types'

/** Past this some chat apps and browsers cut a link: a file travels better. */
export const SAFE_LINK_LENGTH = 30000

const toB64 = (bytes: Uint8Array): string => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

/** Only what is drawn: thumbnails and placed images do not fit in a link. */
export function linkableDoc(doc: SketchDoc): SketchDoc {
  const page = activePage(doc)
  const { imageId: _dropped, ...background } = doc.background ?? {}
  return { ...doc, background, pages: [{ ...page, thumb: '', views: [], placed: [] }], activePageId: page.id }
}

export async function encodeSketchLink(doc: SketchDoc): Promise<string> {
  const stream = new Response(new TextEncoder().encode(serializeDoc(linkableDoc(doc)))).body!.pipeThrough(new CompressionStream('deflate-raw'))
  return toB64(new Uint8Array(await new Response(stream).arrayBuffer()))
}

export async function decodeSketchLink(code: string): Promise<SketchDoc | null> {
  try {
    const stream = new Response(fromB64(code) as BodyInit).body!.pipeThrough(new DecompressionStream('deflate-raw'))
    return parseDoc(await new Response(stream).text())
  } catch {
    return null
  }
}
