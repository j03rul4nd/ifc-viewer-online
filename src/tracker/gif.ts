// A small GIF89a encoder for the email preview: one shared palette, no dithering.
const key = (r: number, g: number, b: number) => (r >> 3) << 10 | (g >> 3) << 5 | b >> 3

export function encodeGif(frames: ImageData[], delayCs: number): Uint8Array {
  const { width: W, height: H } = frames[0]
  const counts = new Map<number, number>()
  for (const f of frames) for (let i = 0; i < f.data.length; i += 4) { const k = key(f.data[i], f.data[i + 1], f.data[i + 2]); counts.set(k, (counts.get(k) ?? 0) + 1) }
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 256).map(([k]) => [(k >> 10 & 31) * 8 + 4, (k >> 5 & 31) * 8 + 4, (k & 31) * 8 + 4])
  while (palette.length < 256) palette.push([0, 0, 0])
  const nearest = new Map<number, number>()
  const index = (k: number) => {
    let hit = nearest.get(k)
    if (hit === undefined) {
      const r = (k >> 10 & 31) * 8 + 4, g = (k >> 5 & 31) * 8 + 4, b = (k & 31) * 8 + 4
      let best = Infinity, found = 0
      palette.forEach((p, i) => { const d = (p[0] - r) ** 2 + (p[1] - g) ** 2 + (p[2] - b) ** 2; if (d < best) { best = d; found = i } })
      nearest.set(k, found); hit = found
    }
    return hit
  }
  const out: number[] = []
  const u16 = (n: number) => out.push(n & 255, n >> 8 & 255)
  for (const c of 'GIF89a') out.push(c.charCodeAt(0))
  u16(W); u16(H); out.push(0xf7, 0, 0)
  for (const p of palette) out.push(p[0], p[1], p[2])
  out.push(0x21, 0xff, 11); for (const c of 'NETSCAPE2.0') out.push(c.charCodeAt(0)); out.push(3, 1, 0, 0, 0)
  for (const f of frames) {
    out.push(0x21, 0xf9, 4, 0); u16(delayCs); out.push(0, 0, 0x2c); u16(0); u16(0); u16(W); u16(H); out.push(0, 8)
    lzw(f, index, out)
  }
  out.push(0x3b)
  return Uint8Array.from(out)
}

function lzw(f: ImageData, index: (k: number) => number, out: number[]): void {
  const CLEAR = 256, END = 257
  let size = 9, next = 258, dict = new Map<number, number>(), acc = 0, bits = 0
  let block: number[] = []
  const flush = () => { if (block.length) { for (const b of [block.length, ...block]) out.push(b); block = [] } }
  const emit = (code: number) => {
    acc |= code << bits; bits += size
    while (bits >= 8) { block.push(acc & 255); acc >>>= 8; bits -= 8; if (block.length === 255) flush() }
  }
  emit(CLEAR)
  const d = f.data
  let cur = index(key(d[0], d[1], d[2]))
  for (let i = 4; i < d.length; i += 4) {
    const c = index(key(d[i], d[i + 1], d[i + 2])), k = cur << 8 | c, hit = dict.get(k)
    if (hit !== undefined) { cur = hit; continue }
    emit(cur)
    if (next === 4095) { emit(CLEAR); dict = new Map(); size = 9; next = 258 }
    else { if (next === 1 << size) size++; dict.set(k, next); next++ }
    cur = c
  }
  emit(cur); emit(END)
  if (bits) block.push(acc & 255)
  flush(); out.push(0)
}
