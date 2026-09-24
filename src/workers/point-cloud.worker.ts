// ─── point-cloud.worker ───────────────────────────────────────────────────────
// Parses a point cloud file off the main thread and streams GPU-ready chunks
// back as transferables.
//
// The file itself is never fully materialised: readers slice the File handle,
// so a 4 GB LAS costs the worker one 8 MB slice at a time. Chunks are posted as
// they complete, which is what lets the viewer show the first points about a
// second in instead of after the whole parse.
//
// Protocol (pc-types.ts): parse → header · budget · progress×n, chunk×n · done | error.
// One worker per file, terminated by the runner on completion — the same
// discipline as geo-extract.worker / ids.worker.

import { createReader } from '../lib/pointcloud/pc-format'
import { PointChunker, cellSizeFor, chunkTransferables } from '../lib/pointcloud/pc-chunker'
import { Bounds } from '../lib/pointcloud/pc-reader'
import { CopcReader } from '../lib/pointcloud/copc-reader'
import { sharedNodeCache } from '../lib/pointcloud/pc-node-cache'
import type {
  PointCloudParseRequest, PointCloudStreamOpenRequest, PointCloudStreamNodesRequest,
  PointCloudWorkerIn, PointCloudWorkerOut, SourceFrame, PointChunk,
} from '../lib/pointcloud/pc-types'

/** Set when a newer parse arrives; the current read loop checks it between slices. */
let currentId: string | null = null

/** The reader held open for a streaming (COPC) session, keyed by cloud id. */
const sessions = new Map<string, { reader: CopcReader; frameOrigin: { x: number; y: number; z: number } }>()

/** Progress is posted at most this often, unless it moved at least PROGRESS_STEP. */
const PROGRESS_INTERVAL_MS = 100
const PROGRESS_STEP = 0.01

// ── Budget hand-off ────────────────────────────────────────────────────────────
// A whole-file parse posts its header and then parks until the runner grants a
// point budget (see PointCloudBudgetGrant). Parked parses are resolved with
// `null` on 'cancel' or when a newer parse supersedes them, so a scan that is
// waiting for the budget stays cancellable instead of pinning the worker.

const budgetWaiters = new Map<string, (maxPoints: number | null) => void>()
/** A grant that arrived before its waiter parked — not expected, but never lost. */
const earlyGrants = new Map<string, number>()

function awaitBudget(id: string): Promise<number | null> {
  const early = earlyGrants.get(id)
  if (early !== undefined) { earlyGrants.delete(id); return Promise.resolve(early) }
  return new Promise((resolve) => budgetWaiters.set(id, resolve))
}

function grantBudget(id: string, maxPoints: number): void {
  const waiter = budgetWaiters.get(id)
  if (!waiter) { earlyGrants.set(id, maxPoints); return }
  budgetWaiters.delete(id)
  waiter(maxPoints)
}

function releaseBudgetWaiters(): void {
  const waiters = [...budgetWaiters.values()]
  budgetWaiters.clear()
  earlyGrants.clear()
  for (const w of waiters) w(null)
}

self.onmessage = (event: MessageEvent<PointCloudWorkerIn>): void => {
  const msg = event.data
  if (!msg) return
  switch (msg.type) {
    case 'cancel':       currentId = null; releaseBudgetWaiters(); break
    case 'parse':        releaseBudgetWaiters(); void run(msg); break
    case 'budget':       grantBudget(msg.id, msg.maxPoints); break
    case 'stream-open':  void streamOpen(msg); break
    case 'stream-nodes': void streamNodes(msg); break
    case 'stream-close': closeSession(msg.id); break
  }
}

function closeSession(id: string): void {
  const session = sessions.get(id)
  if (!session) return
  try { session.reader.close() } catch { /* already closed */ }
  sessions.delete(id)
}

// ── Streaming (COPC only) ──────────────────────────────────────────────────────

/**
 * Open a COPC and hand back its octree index, WITHOUT reading any points beyond
 * the root node the reader samples. The caller then asks for nodes as the camera
 * needs them.
 */
async function streamOpen(req: PointCloudStreamOpenRequest): Promise<void> {
  closeSession(req.id)
  let reader: CopcReader
  let header
  try {
    reader = new CopcReader(req.file, { scanKey: req.scanKey, cache: sharedNodeCache() })
    header = await reader.open()
  } catch (e) {
    post({ type: 'error', id: req.id, errorKey: headerErrorKey(e), detail: detailOf(e) })
    return
  }

  sessions.set(req.id, { reader, frameOrigin: header.frame.origin })
  post({
    type: 'header',
    id: req.id,
    frame: header.frame,
    attributes: header.attributes,
    declaredCount: header.declaredCount,
  })
  post({ type: 'index', id: req.id, root: reader.octreeRoot, nodes: reader.octreeNodes })
}

/**
 * Serve the requested nodes, one chunk each. A COPC node is already spatially
 * compact and level-ordered, so it goes to the GPU as its own chunk rather than
 * through the voxel bucketing the file-order formats need.
 */
async function streamNodes(req: PointCloudStreamNodesRequest): Promise<void> {
  const session = sessions.get(req.id)
  if (!session) { post({ type: 'nodes-done', id: req.id }); return }

  for (const nodeId of req.nodeIds) {
    if (!sessions.has(req.id)) return   // closed while we were working
    let chunk: PointChunk | null = null
    try {
      chunk = await collectNode(session.reader, session.frameOrigin, nodeId)
    } catch (e) {
      post({ type: 'error', id: req.id, errorKey: 'error.copcDecode', detail: detailOf(e) })
      continue
    }
    if (chunk) post({ type: 'node', id: req.id, nodeId, chunk }, chunkTransferables(chunk))
  }
  post({ type: 'nodes-done', id: req.id })
}

/**
 * Decode one node straight into a single chunk. Deliberately NOT routed through
 * PointChunker: bucketing exists to give file-ordered formats spatial coherence,
 * and a COPC node already has it — re-bucketing would only split one tidy draw
 * call into several and throw away the level structure the octree encodes.
 */
async function collectNode(
  reader: CopcReader, frameOrigin: { x: number; y: number; z: number }, nodeId: string,
): Promise<PointChunk | null> {
  const xs: number[] = [], ys: number[] = [], zs: number[] = []
  const cols: number[] = [], ints: number[] = [], clss: number[] = []

  const count = await reader.readNode(nodeId, {
    push(x, y, z, r, g, b, intensity, classification) {
      xs.push(x); ys.push(y); zs.push(z)
      cols.push(r, g, b); ints.push(intensity); clss.push(classification)
    },
  })
  if (count === 0) return null

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (let i = 0; i < count; i++) {
    if (xs[i] < minX) minX = xs[i]; if (xs[i] > maxX) maxX = xs[i]
    if (ys[i] < minY) minY = ys[i]; if (ys[i] > maxY) maxY = ys[i]
    if (zs[i] < minZ) minZ = zs[i]; if (zs[i] > maxZ) maxZ = zs[i]
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2

  const positions = new Float32Array(count * 3)
  const colors = new Uint8Array(count * 3)
  const intensity = new Uint8Array(count)
  const classification = new Uint8Array(count)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = xs[i] - cx
    positions[i * 3 + 1] = ys[i] - cy
    positions[i * 3 + 2] = zs[i] - cz
    colors[i * 3] = cols[i * 3]; colors[i * 3 + 1] = cols[i * 3 + 1]; colors[i * 3 + 2] = cols[i * 3 + 2]
    intensity[i] = ints[i]
    classification[i] = clss[i]
  }

  const hx = (maxX - minX) / 2, hy = (maxY - minY) / 2, hz = (maxZ - minZ) / 2
  return {
    id: nodeId,
    origin: { x: cx - frameOrigin.x, y: cy - frameOrigin.y, z: cz - frameOrigin.z },
    radius: Math.sqrt(hx * hx + hy * hy + hz * hz),
    count,
    positions, colors, intensity, classification, confidence: null,
  }
}

function post(message: PointCloudWorkerOut, transfer: ArrayBuffer[] = []): void {
  ;(self as unknown as Worker).postMessage(message, transfer)
}

async function run(req: PointCloudParseRequest): Promise<void> {
  currentId = req.id
  const stop = (): boolean => currentId !== req.id

  let reader
  try {
    reader = createReader(req.format, req.file)
  } catch {
    post({ type: 'error', id: req.id, errorKey: 'error.readerInit' })
    return
  }

  let header
  try {
    header = await reader.open()
  } catch (e) {
    // A file named .las whose payload is LASzip-compressed is a common mislabel
    // (and the reverse of what detectFormat can see from a magic number, since
    // LAS and LAZ share the "LASF" signature). Re-route rather than refuse.
    if (e instanceof Error && e.message === 'lazCompressed' && req.format !== 'laz') {
      try {
        reader = createReader('laz', req.file)
        header = await reader.open()
      } catch (retry) {
        post({ type: 'error', id: req.id, errorKey: headerErrorKey(retry), detail: detailOf(retry) })
        return
      }
    } else {
      post({ type: 'error', id: req.id, errorKey: headerErrorKey(e), detail: detailOf(e) })
      return
    }
  }
  if (stop()) return

  post({
    type: 'header',
    id: req.id,
    frame: header.frame,
    attributes: header.attributes,
    declaredCount: header.declaredCount,
  })

  // Park until the runner decides how many points this file may keep. Nothing
  // is read in the meantime: the whole point of the wait is that another scan
  // may still be holding the budget this one needs.
  const maxPoints = await awaitBudget(req.id)
  if (maxPoints === null || stop()) return

  // The exact bbox is measured while streaming — for PLY/XYZ the header box is
  // sampled, and the panel must not report an estimate as if it were surveyed.
  const exact = new Bounds()
  let lastProgress = 0
  let decoded = 0
  let lastPostAt = 0
  let lastPostedFraction = -1

  /**
   * Post read progress on its own clock rather than riding on chunks — see the
   * 'progress' message. At least PROGRESS_INTERVAL_MS apart unless it moved a
   * full PROGRESS_STEP, so a fast reader cannot flood the main thread.
   */
  const reportProgress = (fraction: number): void => {
    const now = performance.now()
    const moved = fraction - lastPostedFraction
    if (moved <= 0) return
    if (moved < PROGRESS_STEP && now - lastPostAt < PROGRESS_INTERVAL_MS) return
    lastPostAt = now
    lastPostedFraction = fraction
    post({ type: 'progress', id: req.id, fraction, points: decoded })
  }

  const chunker = new PointChunker({
    origin: header.frame.origin,
    // Chunk granularity follows the point count: few big chunks for a room,
    // hundreds of small ones for a site. See pc-chunker.targetCellsPerAxis.
    // The GRANTED budget, not the whole cap: a file that declares nothing is
    // read up to what it was given, and that is the count to size cells for.
    cellSize: cellSizeFor(header.frame.min, header.frame.max, header.declaredCount ?? maxPoints),
    chunkPoints: req.chunkPoints,
    attributes: header.attributes,
    onChunk: (chunk) => {
      if (stop()) return
      post(
        { type: 'chunk', id: req.id, chunk, progress: lastProgress },
        chunkTransferables(chunk),
      )
    },
  })

  // Wrap the chunker so the exact bounds are accumulated on the same pass.
  const consumer = {
    push(
      x: number, y: number, z: number,
      r: number, g: number, b: number,
      i: number, c: number, q: number,
    ): void {
      exact.add(x, y, z)
      decoded++
      chunker.push(x, y, z, r, g, b, i, c, q)
    },
  }

  let pointCount = 0
  try {
    pointCount = await reader.read(consumer, {
      maxPoints,
      onProgress: (p) => {
        const fraction = Math.min(1, Math.max(0, p))
        lastProgress = Math.round(fraction * 100)
        if (!stop()) reportProgress(fraction)
      },
      shouldStop: stop,
    })
    if (stop()) return
    chunker.flush()
  } catch (e) {
    post({ type: 'error', id: req.id, errorKey: 'error.parseFailed', detail: detailOf(e) })
    return
  }

  if (stop()) return

  const frame: SourceFrame = exact.isEmpty
    ? header.frame
    : exact.toFrame({
        unitScale: header.frame.unitScale,
        unitSource: header.frame.unitSource,
        epsgCode: header.frame.epsgCode,
        // Carried through rather than re-inferred. The reader saw the header and
        // its own sampling; re-running the guess against the exact box here
        // could disagree with what the panel already told the user.
        upAxis: header.frame.upAxis,
        upAxisSource: header.frame.upAxisSource,
      })
  // Keep the origin the chunks were written against — recentring it now would
  // silently shift every chunk that has already been uploaded.
  frame.origin = header.frame.origin

  // "Truncated" means points were left on the floor, not merely that the budget
  // was reached exactly — a file with precisely maxPoints points is complete.
  const truncated = pointCount >= maxPoints &&
    (header.declaredCount === null || header.declaredCount > maxPoints)

  post({ type: 'done', id: req.id, pointCount, truncated, frame })
  currentId = null
}

/** Map reader exceptions onto specific i18n keys — see pointcloud.json. */
function headerErrorKey(e: unknown): string {
  const m = e instanceof Error ? e.message : ''
  switch (m) {
    case 'lazCompressed':        return 'error.lazDecode'
    case 'notLaz':               return 'error.notLaz'
    case 'lazTooLarge':          return 'error.lazTooLarge'
    case 'lazOutOfMemory':       return 'error.lazOutOfMemory'
    case 'lazDecode':            return 'error.lazDecode'
    case 'notCopc':              return 'error.notCopc'
    case 'copcDecode':           return 'error.copcDecode'
    case 'copcNoNodes':          return 'error.copcNoNodes'
    case 'copcTruncated':        return 'error.copcTruncated'
    case 'copcOutOfMemory':      return 'error.copcOutOfMemory'
    case 'notLas':               return 'error.notLas'
    case 'notPly':               return 'error.notPly'
    case 'plyNoXyz':             return 'error.plyNoXyz'
    case 'plyListVertex':
    case 'plyElementBeforeVertex': return 'error.plyLayout'
    case 'plyUnknownFormat':
    case 'plyUnknownType':
    case 'plyNoFormat':
    case 'plyNoHeaderEnd':       return 'error.plyMalformed'
    case 'pcdNoXyz':             return 'error.pcdNoXyz'
    case 'pcdUnknownEncoding':   return 'error.pcdEncoding'
    case 'pcdCompressedSizeMismatch':
    case 'pcdLzfOverflow':
    case 'pcdLzfTruncated':
    case 'pcdLzfBadRef':
    case 'pcdLzfShort':          return 'error.pcdCompressed'
    case 'pcdNoData':
    case 'pcdNoEncoding':
    case 'pcdNoFields':
    case 'pcdUnknownType':       return 'error.pcdMalformed'
    case 'pcdNoPoints':
    case 'plyNoVertices':
    case 'xyzEmpty':
    case 'xyzNoData':            return 'error.noPoints'
    case 'truncatedHeader':
    case 'badRecordLength':      return 'error.malformedHeader'
    default:                     return 'error.headerFailed'
  }
}

function detailOf(e: unknown): string | undefined {
  return e instanceof Error ? e.message : undefined
}

export type { PointCloudWorkerOut }
