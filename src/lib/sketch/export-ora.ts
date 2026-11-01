// ─── OpenRaster ───────────────────────────────────────────────────────────────
// Krita's native exchange format, also read by GIMP and MyPaint: a zip of PNGs
// and a stack.xml. Stored, not deflated, because PNGs are compressed already.
// The first entry must be an uncompressed `mimetype`, as the format requires.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

export function zipStored(files: readonly { name: string; data: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder()
  const u16 = (v: number) => [v & 255, (v >> 8) & 255]
  const u32 = (v: number) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255]
  const local: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const crc = crc32(file.data)
    const shared = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(file.data.length), ...u32(file.data.length), ...u16(name.length), ...u16(0)]
    const head = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...shared])
    local.push(head, name, file.data)
    central.push(Uint8Array.from([0x50, 0x4b, 0x01, 0x02, ...u16(20), ...shared, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name)
    offset += head.length + name.length + file.data.length
  }
  const size = central.reduce((n, c) => n + c.length, 0)
  const end = Uint8Array.from([0x50, 0x4b, 0x05, 0x06, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(size), ...u32(offset), ...u16(0)])
  const out = new Uint8Array(offset + size + end.length)
  let at = 0
  for (const part of [...local, ...central, end]) { out.set(part, at); at += part.length }
  return out
}

const COMPOSITE: Record<string, string> = { normal: 'svg:src-over', multiply: 'svg:multiply', screen: 'svg:screen', add: 'svg:plus' }

const xml = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export interface OraLayer { name: string; png: Uint8Array; visible: boolean; opacity: number; blend: string }

/** Layers bottom first, as the document has them; the format lists them top first. */
export function encodeOra(width: number, height: number, layers: readonly OraLayer[], merged: Uint8Array, thumbnail: Uint8Array): Uint8Array {
  const encoder = new TextEncoder()
  const entries = layers.map((l, i) => `<layer name="${xml(l.name)}" src="data/layer${i}.png" opacity="${l.opacity}" visibility="${l.visible ? 'visible' : 'hidden'}" composite-op="${COMPOSITE[l.blend] ?? COMPOSITE.normal}"/>`).reverse()
  const stack = `<?xml version="1.0" encoding="UTF-8"?><image version="0.0.3" w="${width}" h="${height}"><stack>${entries.join('')}</stack></image>`
  return zipStored([
    { name: 'mimetype', data: encoder.encode('image/openraster') },
    { name: 'stack.xml', data: encoder.encode(stack) },
    ...layers.map((l, i) => ({ name: `data/layer${i}.png`, data: l.png })),
    { name: 'mergedimage.png', data: merged },
    { name: 'Thumbnails/thumbnail.png', data: thumbnail },
  ])
}
