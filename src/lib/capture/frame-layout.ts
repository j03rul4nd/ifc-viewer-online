// ─── Output frame geometry ─────────────────────────────────────────────────────
// Where the captured viewport lands inside the exported frame. Two modes, and
// the choice matters a lot for social output:
//
//   'crop' — fill the frame, centre-cropping the sides. Great for 1:1 and 4:5.
//            Terrible for 9:16 from a landscape viewport: a 1920×1080 capture
//            keeps a 607 px-wide slice and the building falls off both edges.
//   'fit'  — contain the whole frame and pad the remainder. Nothing is lost, and
//            the bars are exactly where a Reel wants its caption anyway.
//
// Pure arithmetic — no canvas, no DOM — so the preview, the GIF encoder and the
// video encoder all derive identical geometry from the same numbers (D-26).

import { computeCropRect, computeScaledSize, type CaptureAspect, type CropRect } from './replay-buffer-core'

export type FrameFit = 'crop' | 'fit'

export const FRAME_FITS: readonly FrameFit[] = ['crop', 'fit']

/** How the padding around a 'fit' frame is filled. */
export type PadStyle = 'blur' | 'dark' | 'light'

export const PAD_STYLES: readonly PadStyle[] = ['blur', 'dark', 'light']

export interface DestRect { dx: number; dy: number; dw: number; dh: number }

export interface FrameLayout {
  /** Output canvas size in px (both even — encoder-friendly). */
  width: number
  height: number
  /** Rect sampled from the source video frame. */
  src: CropRect
  /** Rect the sampled source is drawn into on the output canvas. */
  dst: DestRect
  /** True when bars are visible and the compositor must fill them. */
  padded: boolean
}

/** Target width/height ratio of an aspect preset, or null for 'source'. */
const RATIO: Record<Exclude<CaptureAspect, 'source'>, number> = {
  square: 1,
  vertical: 4 / 5,
  story: 9 / 16,
  wide: 16 / 9,
}

const even = (n: number): number => Math.max(2, 2 * Math.floor(n / 2))

/**
 * Resolve the full output geometry.
 *
 * `targetHeight: null` keeps the source height. 'crop' never upscales; 'fit'
 * may letterbox but likewise never scales the picture itself above 1:1.
 */
export function computeFrameLayout(
  srcWidth: number,
  srcHeight: number,
  aspect: CaptureAspect,
  fit: FrameFit,
  targetHeight: number | null,
): FrameLayout {
  const sw = Math.max(1, Math.floor(srcWidth) || 1)
  const sh = Math.max(1, Math.floor(srcHeight) || 1)

  // 'source' ignores fit entirely — there is nothing to crop or pad against.
  if (aspect === 'source') {
    const size = computeScaledSize(sw, sh, targetHeight)
    return {
      width: size.width,
      height: size.height,
      src: { sx: 0, sy: 0, sw, sh },
      dst: { dx: 0, dy: 0, dw: size.width, dh: size.height },
      padded: false,
    }
  }

  if (fit === 'crop') {
    const src = computeCropRect(sw, sh, aspect)
    const size = computeScaledSize(src.sw, src.sh, targetHeight)
    return {
      width: size.width,
      height: size.height,
      src,
      dst: { dx: 0, dy: 0, dw: size.width, dh: size.height },
      padded: false,
    }
  }

  // 'fit': the frame is the requested ratio at the requested height, and the
  // whole source is contained inside it.
  const ratio = RATIO[aspect]
  const height = even(targetHeight === null || targetHeight >= sh ? sh : targetHeight)
  const width = even(height * ratio)
  const scale = Math.min(width / sw, height / sh)
  const dw = even(sw * scale)
  const dh = even(sh * scale)
  return {
    width,
    height,
    src: { sx: 0, sy: 0, sw, sh },
    dst: {
      dx: Math.round((width - dw) / 2),
      dy: Math.round((height - dh) / 2),
      dw,
      dh,
    },
    // A 1 px rounding sliver is not a bar worth filling.
    padded: dw < width - 1 || dh < height - 1,
  }
}

/**
 * Rect to draw a blurred backdrop into: the source scaled to COVER the output
 * (the opposite of `dst`), overscanned so the blur kernel never reveals the
 * canvas edge. Only meaningful when `layout.padded`.
 */
export function computeBackdropRect(layout: FrameLayout, overscan = 1.12): DestRect {
  const { src, width, height } = layout
  const scale = Math.max(width / src.sw, height / src.sh) * overscan
  const dw = src.sw * scale
  const dh = src.sh * scale
  return { dx: (width - dw) / 2, dy: (height - dh) / 2, dw, dh }
}

/** Blur radius in px for the padded backdrop, scaled to the output size. */
export function backdropBlurPx(layout: FrameLayout): number {
  return Math.max(8, Math.round(Math.min(layout.width, layout.height) * 0.06))
}

/** Solid fill for a pad style, or null when the backdrop is the blurred frame. */
export function padFillColor(style: PadStyle): string | null {
  if (style === 'dark') return '#0b0d11'
  if (style === 'light') return '#f4f5f7'
  return null
}
