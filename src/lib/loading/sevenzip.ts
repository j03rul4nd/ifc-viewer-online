// ─── RAR and 7z in the browser ───────────────────────────────────────────────
// 7-Zip compiled to WASM (7z-wasm, ~1.6 MB). Imported only when a .rar / .7z is
// dropped, so it never reaches the entry chunk. One instance per archive: an
// emscripten program is not meant to run main() twice, and the in-memory FS
// is thrown away with it.

/** Thrown for a password-protected archive; expand-drop names it as such. */
export class EncryptedArchiveError extends Error {
  constructor() {
    super('encrypted')
    this.name = 'EncryptedArchiveError'
  }
}

type SevenZipModule = Awaited<ReturnType<typeof import('7z-wasm')['default']>>

const isNode = typeof process !== 'undefined' && !!process.versions?.node

async function instantiate(log: string[]): Promise<SevenZipModule> {
  const [{ default: SevenZip }, wasmUrl] = await Promise.all([
    import('7z-wasm'),
    import('7z-wasm/7zz.wasm?url') as Promise<{ default: string }>,
  ])
  return SevenZip({
    print: (s) => log.push(s),
    printErr: (s) => log.push(s),
    // Vite fingerprints the .wasm as an asset; under Node (tests) emscripten
    // reads it from the package folder itself.
    ...(isNode ? {} : { locateFile: () => wasmUrl.default }),
  })
}

/** Every regular file in a RAR / 7z archive, with its path inside it. */
export async function extractWith7z(bytes: Uint8Array): Promise<Array<{ path: string; data: Uint8Array }>> {
  const log: string[] = []
  const sz = await instantiate(log)
  sz.FS.writeFile('/in', bytes)
  sz.FS.mkdir('/out')
  let code: number
  try {
    // A dummy password: 7-Zip never prompts, an encrypted entry fails instead.
    code = sz.callMain(['x', '/in', '-o/out', '-y', '-p-', '-bso1', '-bse1', '-bd']) as unknown as number
  } catch {
    // 7-Zip aborted out of main() and left nothing in the log. Encrypted
    // headers do that — but so can a damaged archive, so only say "password"
    // when the bytes themselves say so.
    if (looksEncrypted(bytes)) throw new EncryptedArchiveError()
    throw new Error('7-Zip could not read this archive (damaged, or a variant it does not support)')
  }
  const text = log.join('\n')
  // Exact 7-Zip messages, not a bare "encrypted": a file NAMED encrypted.ifc
  // in a healthy archive must not trip this.
  if (/Wrong password|Data Error in encrypted file|Cannot open encrypted archive/i.test(text)) throw new EncryptedArchiveError()
  if (code !== 0) {
    const err = log.find((l) => /ERROR/.test(l) && !/^ERROR:\s*\/in\s*$/.test(l))
      ?? log.find((l) => /Cannot open|Unexpected end|Headers Error|CRC Failed/i.test(l))
      ?? `7-Zip exit code ${code}`
    throw new Error(err.replace(/^ERROR:\s*/, '').trim())
  }

  const out: Array<{ path: string; data: Uint8Array }> = []
  const walk = (dir: string, rel: string): void => {
    for (const name of sz.FS.readdir(dir)) {
      if (name === '.' || name === '..') continue
      const full = `${dir}/${name}`
      const path = rel ? `${rel}/${name}` : name
      if (sz.FS.isDir(sz.FS.stat(full).mode)) walk(full, path)
      else out.push({ path, data: sz.FS.readFile(full) })
    }
  }
  walk('/out', '')
  return out
}

/**
 * Does the archive itself declare a password? Read from the bytes, because
 * 7-Zip aborts without a word on encrypted headers.
 *  - 7z: the AES-256 coder id (06 F1 07 01) appears in the header block.
 *  - RAR 4: main header flag 0x0080 (encrypted headers) or a file header
 *    with flag 0x0004.
 *  - RAR 5: an archive encryption header (type 4) right after the signature.
 */
export function looksEncrypted(b: Uint8Array): boolean {
  const is7z = b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf
  if (is7z) {
    for (let i = 0; i + 3 < b.length; i++) {
      if (b[i] === 0x06 && b[i + 1] === 0xf1 && b[i + 2] === 0x07 && b[i + 3] === 0x01) return true
    }
    return false
  }
  const isRar = b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21 && b[4] === 0x1a && b[5] === 0x07
  if (!isRar) return false
  if (b[6] === 0x01 && b[7] === 0x00) {
    // RAR 5: header = CRC32 (4) + vint size + vint type.
    let o = 12
    const vint = (): number => { let v = 0, sh = 0; while (o < b.length) { const x = b[o++]; v |= (x & 0x7f) << sh; if (!(x & 0x80)) break; sh += 7 } return v }
    vint() // size
    return vint() === 4
  }
  // RAR 4: walk the headers (CRC16, type, flags u16, size u16 [+ add_size]).
  let o = 7
  while (o + 7 <= b.length) {
    const type = b[o + 2]
    const flags = b[o + 3] | (b[o + 4] << 8)
    const size = b[o + 5] | (b[o + 6] << 8)
    if (type === 0x73 && (flags & 0x0080)) return true
    if (type === 0x74 && (flags & 0x0004)) return true
    if (size < 7) return false
    let next = o + size
    if (flags & 0x8000) next += (b[o + 7] | (b[o + 8] << 8) | (b[o + 9] << 16) | (b[o + 10] << 24)) >>> 0
    if (type === 0x7b || next <= o) return false
    o = next
  }
  return false
}
