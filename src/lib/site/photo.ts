// ─── Site photos, shrunk in the browser ───────────────────────────────────────
// A phone photo is 4-12 MB; a snag needs ~200 kB. Decode, scale the long side to
// 1600 px and re-encode as JPEG before it ever reaches IndexedDB.

export const PHOTO_MAX_SIDE = 1600
export const PHOTO_QUALITY = 0.75

/** Target size keeping the aspect ratio; never upscales. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max || long <= 0) return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) }
  const s = max / long
  return { width: Math.max(1, Math.round(width * s)), height: Math.max(1, Math.round(height * s)) }
}

export interface CompressedPhoto { blob: Blob; width: number; height: number }

export async function compressPhoto(file: Blob, max = PHOTO_MAX_SIDE, quality = PHOTO_QUALITY): Promise<CompressedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
    let blob: Blob | null
    if (typeof OffscreenCanvas !== 'undefined') {
      const c = new OffscreenCanvas(width, height)
      c.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
      blob = await c.convertToBlob({ type: 'image/jpeg', quality })
    } else {
      const c = document.createElement('canvas')
      c.width = width; c.height = height
      c.getContext('2d')!.drawImage(bitmap, 0, 0, width, height)
      blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', quality))
    }
    if (!blob) throw new Error('Photo could not be encoded')
    return { blob, width, height }
  } finally {
    bitmap.close()
  }
}

/** Pixel size of a JPEG from its SOF marker, without decoding. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) { i++; continue }
    const m = bytes[i + 1]
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] }
    }
    i += 2 + len
  }
  return null
}
