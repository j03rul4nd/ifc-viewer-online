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
    // Encrypted headers make 7-Zip throw out of main() rather than return.
    throw new EncryptedArchiveError()
  }
  const text = log.join('\n')
  if (/wrong password|encrypted/i.test(text)) throw new EncryptedArchiveError()
  if (code !== 0) {
    const err = log.find((l) => /ERROR/.test(l)) ?? `7-Zip exit code ${code}`
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
