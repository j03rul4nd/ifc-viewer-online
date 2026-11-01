// ─── Layered PSD ──────────────────────────────────────────────────────────────
// The one format Procreate (through its gallery import), Sketchbook, Krita, Clip
// Studio, Photoshop and Affinity all read with layers intact. Written by hand
// with PackBits, because sketches are mostly empty rows and a raw file would be
// tens of megabytes. Pure bytes: nothing here touches the DOM.

export interface PsdLayer {
  name: string
  /** RGBA, straight alpha, width × height × 4. */
  rgba: Uint8ClampedArray | Uint8Array
  visible: boolean
  /** 0..1. Absent means 1. */
  opacity?: number
  blend?: 'normal' | 'multiply' | 'screen' | 'add'
}

class Writer {
  private chunks: Uint8Array[] = []
  private size = 0
  bytes(b: Uint8Array): void { this.chunks.push(b); this.size += b.length }
  u8(v: number): void { this.bytes(Uint8Array.of(v & 255)) }
  u16(v: number): void { this.bytes(Uint8Array.of((v >> 8) & 255, v & 255)) }
  i16(v: number): void { this.u16(v & 0xffff) }
  u32(v: number): void { this.bytes(Uint8Array.of((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255)) }
  ascii(s: string): void { this.bytes(Uint8Array.from(s, (c) => c.charCodeAt(0) & 255)) }
  get length(): number { return this.size }
  finish(): Uint8Array {
    const out = new Uint8Array(this.size)
    let at = 0
    for (const c of this.chunks) { out.set(c, at); at += c.length }
    return out
  }
}

/** PackBits, as PSD uses it. */
export function packBits(row: Uint8Array): Uint8Array {
  const out: number[] = []
  let i = 0
  while (i < row.length) {
    let run = 1
    while (i + run < row.length && run < 128 && row[i + run] === row[i]) run++
    if (run >= 2) {
      out.push(257 - run, row[i])
      i += run
      continue
    }
    const start = i
    i++
    while (i < row.length && i - start < 128 && !(i + 1 < row.length && row[i] === row[i + 1])) i++
    out.push(i - start - 1)
    for (let k = start; k < i; k++) out.push(row[k])
  }
  return Uint8Array.from(out)
}

/** One channel as RLE: compression tag, row byte counts, rows. */
function rleChannel(rgba: ArrayLike<number>, offset: number, width: number, height: number, withTag: boolean): Uint8Array {
  const w = new Writer()
  if (withTag) w.u16(1)
  const rows: Uint8Array[] = []
  const row = new Uint8Array(width)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = rgba[(y * width + x) * 4 + offset]
    const packed = packBits(row)
    rows.push(packed)
    w.u16(packed.length)
  }
  rows.forEach((r) => w.bytes(r))
  return w.finish()
}

const utf16 = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length * 2)
  for (let i = 0; i < s.length; i++) { out[i * 2] = s.charCodeAt(i) >> 8; out[i * 2 + 1] = s.charCodeAt(i) & 255 }
  return out
}

function layerRecord(layer: PsdLayer, width: number, height: number, channels: Uint8Array[]): Uint8Array {
  const w = new Writer()
  w.u32(0); w.u32(0); w.u32(height); w.u32(width)
  w.u16(4)
  ;[-1, 0, 1, 2].forEach((id, i) => { w.i16(id); w.u32(channels[i].length) })
  w.ascii('8BIM'); w.ascii({ normal: 'norm', multiply: 'mul ', screen: 'scrn', add: 'lddg' }[layer.blend ?? 'normal'])
  w.u8(Math.round((layer.opacity ?? 1) * 255)) // opacity
  w.u8(0) // clipping
  w.u8(layer.visible ? 0 : 2) // flags: bit 1 hides the layer
  w.u8(0) // filler

  const extra = new Writer()
  extra.u32(0) // no mask
  extra.u32(0) // no blending ranges
  // Pascal name padded to 4 bytes, ASCII only: the real name follows as luni.
  const ascii = layer.name.replace(/[^\x20-\x7e]/g, '_').slice(0, 255)
  extra.u8(ascii.length)
  extra.ascii(ascii)
  for (let pad = (ascii.length + 1) % 4; pad !== 0 && pad < 4; pad++) extra.u8(0)
  const unicode = utf16(layer.name)
  extra.ascii('8BIM'); extra.ascii('luni')
  const luniLength = 4 + unicode.length
  const padded = luniLength + (luniLength % 2)
  extra.u32(padded)
  extra.u32(layer.name.length)
  extra.bytes(unicode)
  if (padded !== luniLength) extra.u8(0)
  const block = extra.finish()
  w.u32(block.length)
  w.bytes(block)
  return w.finish()
}

/** `composite` is RGBA, what apps without layer support show. Layers bottom first. */
export function encodePsd(width: number, height: number, layers: readonly PsdLayer[], composite: ArrayLike<number>): Uint8Array {
  const w = new Writer()
  w.ascii('8BPS')
  w.u16(1)
  w.bytes(new Uint8Array(6))
  w.u16(4) // RGBA
  w.u32(height); w.u32(width)
  w.u16(8); w.u16(3) // 8 bits, RGB
  w.u32(0) // colour mode data
  w.u32(0) // image resources

  // Channel order in a record is -1 (alpha), 0, 1, 2: rgba offsets 3, 0, 1, 2.
  const records = layers.map((layer) => {
    const channels = [3, 0, 1, 2].map((o) => rleChannel(layer.rgba, o, width, height, true))
    return { record: layerRecord(layer, width, height, channels), channels }
  })
  const info = new Writer()
  info.i16(-layers.length) // negative: the first alpha channel is the composite's transparency
  records.forEach((r) => info.bytes(r.record))
  records.forEach((r) => r.channels.forEach((c) => info.bytes(c)))
  if (info.length % 2) info.u8(0)
  const infoBytes = info.finish()
  w.u32(infoBytes.length + 4 + 4)
  w.u32(infoBytes.length)
  w.bytes(infoBytes)
  w.u32(0) // global mask

  // Merged image: one compression tag, then all row counts, then all rows.
  w.u16(1)
  const merged = [0, 1, 2, 3].map((o) => {
    const c = rleChannel(composite, o, width, height, false)
    return { counts: c.subarray(0, height * 2), rows: c.subarray(height * 2) }
  })
  merged.forEach((m) => w.bytes(m.counts))
  merged.forEach((m) => w.bytes(m.rows))
  return w.finish()
}
