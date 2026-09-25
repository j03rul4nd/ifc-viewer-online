// ─── File fingerprint ─────────────────────────────────────────────────────────
// A cheap, content-derived identity for a model file: its size plus a SHA-256
// over three 64 KB samples (head, middle, tail). It powers two things:
//
//   • duplicate detection — the same bytes under another name, or dropped twice,
//     are recognised before a second copy is parsed;
//   • cache validation — the OPFS key is still name:size:mtime (it also keys
//     saved placements), but a hit whose stored fingerprint differs is stale.
//
// Why sampled and not a full hash: hashing a 1 GB IFC reads 1 GB and, with
// `crypto.subtle`, needs it in memory at once (no streaming digest). Three
// samples cost ~1 ms and catch every realistic change: an IFC edit rewrites the
// header timestamp (head), and any change in length moves the tail. What it can
// miss — a same-size edit confined to an unsampled region with an identical
// header — needs a hand-edited file with a frozen timestamp, and the worst
// outcome is a stale cache entry the user clears with Reload.

const SAMPLE = 64 * 1024
const PREFIX = 'f1'

async function sampleBytes(blob: Blob): Promise<Uint8Array> {
  const size = blob.size
  if (size <= SAMPLE * 3) return new Uint8Array(await blob.arrayBuffer())
  const mid = Math.floor(size / 2 - SAMPLE / 2)
  const parts = await Promise.all([
    blob.slice(0, SAMPLE).arrayBuffer(),
    blob.slice(mid, mid + SAMPLE).arrayBuffer(),
    blob.slice(size - SAMPLE, size).arrayBuffer(),
  ])
  const out = new Uint8Array(SAMPLE * 3)
  out.set(new Uint8Array(parts[0]), 0)
  out.set(new Uint8Array(parts[1]), SAMPLE)
  out.set(new Uint8Array(parts[2]), SAMPLE * 2)
  return out
}

function toHex(bytes: Uint8Array, count: number): string {
  let s = ''
  for (let i = 0; i < Math.min(count, bytes.length); i++) s += bytes[i].toString(16).padStart(2, '0')
  return s
}

/** FNV-1a 64-bit, for contexts without SubtleCrypto (plain-http LAN hosts). */
function fnv1a64(bytes: Uint8Array): Uint8Array {
  let h1 = 0x811c9dc5 | 0
  let h2 = 0xcbf29ce4 | 0
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i]
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= bytes[(bytes.length - 1) - i]
    h2 = Math.imul(h2, 0x01000193)
  }
  const out = new Uint8Array(8)
  new DataView(out.buffer).setUint32(0, h1 >>> 0)
  new DataView(out.buffer).setUint32(4, h2 >>> 0)
  return out
}

/**
 * `f1:<size>:<32 hex chars>` for any Blob/File. Never throws for a readable
 * blob; rejects only if the blob itself cannot be read.
 */
export async function fingerprintBlob(blob: Blob): Promise<string> {
  return digestSample(await sampleBytes(blob), blob.size)
}

async function digestSample(sample: Uint8Array, size: number): Promise<string> {
  // Mix the size in so equal samples of different-length files differ.
  const sized = new Uint8Array(sample.length + 8)
  sized.set(sample, 0)
  new DataView(sized.buffer).setFloat64(sample.length, size)
  let digest: Uint8Array
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle
  if (subtle && typeof subtle.digest === 'function') {
    try {
      digest = new Uint8Array(await subtle.digest('SHA-256', sized))
    } catch {
      digest = fnv1a64(sized)
    }
  } else {
    digest = fnv1a64(sized)
  }
  return `${PREFIX}:${size}:${toHex(digest, 16)}`
}

/**
 * Fingerprint raw bytes (SDK sources). Samples the view directly — wrapping the
 * bytes in a Blob first would copy the whole model just to read 192 KB of it.
 */
export async function fingerprintBytes(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  const size = view.byteLength
  let sample: Uint8Array
  if (size <= SAMPLE * 3) {
    sample = view.slice()
  } else {
    const mid = Math.floor(size / 2 - SAMPLE / 2)
    sample = new Uint8Array(SAMPLE * 3)
    sample.set(view.subarray(0, SAMPLE), 0)
    sample.set(view.subarray(mid, mid + SAMPLE), SAMPLE)
    sample.set(view.subarray(size - SAMPLE, size), SAMPLE * 2)
  }
  return digestSample(sample, size)
}

/**
 * A mesh import's identity: its entry file's fingerprint, plus the files it
 * came with when the format references files of its own (.gltf, .obj). An
 * .obj imported alone (grey) and the same .obj with its .mtl and textures are
 * different imports — the second is how a user fixes the first. Sidecars
 * count by name and size: the model references them by name. A .glb is
 * self-contained, so whatever else sat in the same drop does not change it.
 */
export function meshIdentity(
  entryName: string,
  entryFingerprint: string,
  sidecars: ReadonlyArray<{ name: string; size: number }>,
): string {
  if (/\.glb$/i.test(entryName) || sidecars.length === 0) return entryFingerprint
  const signature = sidecars.map((f) => `${f.name.toLowerCase()}:${f.size}`).sort().join('|')
  return `${entryFingerprint}+${signature}`
}
