// Local type declarations for `gifenc` 1.x (ships no TypeScript types).
// Surface kept to exactly what gif-export.worker.ts consumes.
declare module 'gifenc' {
  export type GifPalette = number[][]

  export interface WriteFrameOptions {
    palette?: GifPalette
    /** Per-frame delay in milliseconds. */
    delay?: number
    transparent?: boolean
    transparentIndex?: number
    /** First frame writes the header + logical screen descriptor. */
    first?: boolean
    repeat?: number
    dispose?: number
  }

  export interface GifEncoderInstance {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: WriteFrameOptions): void
    finish(): void
    /** Copy of the encoded bytes written so far. */
    bytes(): Uint8Array
    /** Zero-copy view over the internal buffer (valid until next write). */
    bytesView(): Uint8Array
    reset(): void
  }

  export interface GifEncoderOptions {
    auto?: boolean
    initialCapacity?: number
  }

  export function GIFEncoder(opts?: GifEncoderOptions): GifEncoderInstance

  export interface QuantizeOptions {
    format?: 'rgb565' | 'rgb444' | 'rgba4444'
    oneBitAlpha?: boolean | number
    clearAlpha?: boolean
    clearAlphaThreshold?: number
    clearAlphaColor?: number
  }

  /** Build a ≤maxColors palette from RGBA pixel data. */
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: QuantizeOptions): GifPalette

  /** Map RGBA pixels to palette indices. */
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: GifPalette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array

  export function nearestColorIndex(palette: GifPalette, pixel: number[]): number
  export function snapColorsToPalette(palette: GifPalette, knownColors: number[][], threshold?: number): void
}
