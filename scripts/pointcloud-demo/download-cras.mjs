import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, open, rename, rm, stat } from 'node:fs/promises'
import { get } from 'node:https'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(SCRIPT_DIR, '..', '..')
const RAW_DIR = path.join(ROOT, 'demo', 'raw')

const FILES = [
  {
    sourceName: 'craslabannotated.zip',
    outputName: 'pointcloud-original.zip',
    size: 4_267_281_425,
    md5: 'e5ecedab8f2a1d1f91861a3aec028a72',
    ranges: 8,
  },
  {
    sourceName: 'craslabbim.ifc',
    outputName: 'model-original.ifc',
    size: 67_553_572,
    md5: 'e20658f0d2d9e13c62363169b7fa3193',
    ranges: 2,
  },
]

function sourceUrl(name) {
  return `https://zenodo.org/api/records/7948116/files/${encodeURIComponent(name)}/content`
}

function assertInsideRaw(target) {
  const relative = path.relative(RAW_DIR, path.resolve(target))
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside ${RAW_DIR}: ${target}`)
  }
}

async function fileSize(filename) {
  try {
    return (await stat(filename)).size
  } catch (error) {
    if (error?.code === 'ENOENT') return -1
    throw error
  }
}

function requestToFile(url, filename, range, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    const request = get(
      url,
      {
        headers: {
          Range: `bytes=${range.start}-${range.end}`,
          'User-Agent': 'IFC-Viewer-Online-CRAS-demo/1.0',
        },
      },
      (response) => {
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location &&
          redirectsLeft > 0
        ) {
          response.resume()
          requestToFile(
            new URL(response.headers.location, url).toString(),
            filename,
            range,
            redirectsLeft - 1,
          ).then(resolve, reject)
          return
        }

        if (response.statusCode !== 206) {
          response.resume()
          reject(new Error(`Expected HTTP 206 for ${range.start}-${range.end}; got ${response.statusCode}`))
          return
        }

        pipeline(response, createWriteStream(filename)).then(resolve, reject)
      },
    )
    request.setTimeout(120_000, () => request.destroy(new Error('Download timed out')))
    request.on('error', reject)
  })
}

async function downloadRange(url, partsDir, index, start, end) {
  const filename = path.join(partsDir, `part-${String(index).padStart(2, '0')}.bin`)
  const partial = `${filename}.partial`
  const expected = end - start + 1
  if ((await fileSize(filename)) === expected) return filename

  await rm(partial, { force: true })
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await requestToFile(url, partial, { start, end })
      const received = await fileSize(partial)
      if (received !== expected) {
        throw new Error(`Range ${index} has ${received} bytes; expected ${expected}`)
      }
      await rename(partial, filename)
      return filename
    } catch (error) {
      await rm(partial, { force: true })
      if (attempt === 5) throw error
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000))
    }
  }
  throw new Error(`Unreachable: range ${index}`)
}

async function combine(parts, output) {
  const handle = await open(output, 'w')
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024)
  try {
    let outputOffset = 0
    for (const part of parts) {
      const input = await open(part, 'r')
      try {
        let inputOffset = 0
        while (true) {
          const { bytesRead } = await input.read(buffer, 0, buffer.length, inputOffset)
          if (bytesRead === 0) break
          await handle.write(buffer, 0, bytesRead, outputOffset)
          inputOffset += bytesRead
          outputOffset += bytesRead
        }
      } finally {
        await input.close()
      }
    }
  } finally {
    await handle.close()
  }
}

async function md5(filename) {
  const hash = createHash('md5')
  await pipeline(createReadStream(filename), hash)
  return hash.digest('hex')
}

async function downloadFile(spec) {
  const output = path.join(RAW_DIR, spec.outputName)
  assertInsideRaw(output)
  if ((await fileSize(output)) === spec.size && (await md5(output)) === spec.md5) {
    console.log(`verified existing ${spec.outputName}`)
    return
  }

  const partsDir = path.join(RAW_DIR, `.download-${spec.outputName}`)
  assertInsideRaw(partsDir)
  await mkdir(partsDir, { recursive: true })
  const chunkSize = Math.ceil(spec.size / spec.ranges)
  const jobs = []
  for (let index = 0; index < spec.ranges; index += 1) {
    const start = index * chunkSize
    const end = Math.min(spec.size - 1, start + chunkSize - 1)
    jobs.push(downloadRange(sourceUrl(spec.sourceName), partsDir, index, start, end))
  }

  console.log(`downloading ${spec.sourceName} in ${jobs.length} verified ranges`)
  const parts = await Promise.all(jobs)
  await combine(parts, output)
  const actualSize = await fileSize(output)
  const actualMd5 = await md5(output)
  if (actualSize !== spec.size || actualMd5 !== spec.md5) {
    throw new Error(
      `${spec.outputName} failed validation: ${actualSize}/${actualMd5}; ` +
        `expected ${spec.size}/${spec.md5}`,
    )
  }

  await rm(partsDir, { recursive: true, force: true })
  console.log(`verified ${spec.outputName}: ${actualSize} bytes, md5:${actualMd5}`)
}

await mkdir(RAW_DIR, { recursive: true })
for (const file of FILES) await downloadFile(file)
