// Export portable PLY snapshots from the same deterministic sources used by
// the live temporal replays. These are honest static examples for download,
// offline demos and regression tests; the browser replay remains the moving
// version and is explicitly labelled as simulated in the product UI.

import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { TEMPORAL_LIDAR_SHOWCASES } from '../../src/demo-models/realtime-lidar-showcases.ts'

const outputDir = path.resolve(process.argv[2] ?? 'public/models/realtime-lidar')
mkdirSync(outputDir, { recursive: true })

const exportNames: Record<string, string> = {
  'warehouse-operations': 'warehouse-operations-snapshot.ply',
  'construction-progress': 'construction-progress-snapshot.ply',
  'utility-tunnel': 'utility-tunnel-snapshot.ply',
}

function buildPly(showcaseId: string): { fileName: string; bytes: Buffer; count: number } {
  const showcase = TEMPORAL_LIDAR_SHOWCASES.find((item) => item.id === showcaseId)
  if (!showcase) throw new Error(`Unknown showcase ${showcaseId}`)
  const source = showcase.createSource()
  const frame = source.sample(showcase.durationMs * 0.74, 1)
  const fileName = exportNames[showcase.id]
  if (!fileName) throw new Error(`No PLY filename for ${showcase.id}`)

  const header = Buffer.from([
    'ply',
    'format binary_little_endian 1.0',
    'comment IFC Viewer Online deterministic temporal LiDAR snapshot',
    'comment Synthetic example; not a physical sensor capture',
    `comment Companion IFC ${showcase.modelFileName}`,
    `element vertex ${frame.count}`,
    'property float x',
    'property float y',
    'property float z',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'property uchar intensity',
    'property uchar classification',
    'end_header',
    '',
  ].join('\n'))
  const stride = 17
  const body = Buffer.allocUnsafe(frame.count * stride)
  for (let index = 0; index < frame.count; index++) {
    const sourceOffset = index * 3
    const targetOffset = index * stride
    body.writeFloatLE(frame.positions[sourceOffset], targetOffset)
    body.writeFloatLE(frame.positions[sourceOffset + 1], targetOffset + 4)
    body.writeFloatLE(frame.positions[sourceOffset + 2], targetOffset + 8)
    body[targetOffset + 12] = frame.colors?.[sourceOffset] ?? 220
    body[targetOffset + 13] = frame.colors?.[sourceOffset + 1] ?? 220
    body[targetOffset + 14] = frame.colors?.[sourceOffset + 2] ?? 220
    body[targetOffset + 15] = frame.intensity?.[index] ?? 220
    body[targetOffset + 16] = frame.classification?.[index] ?? 0
  }
  return { fileName, bytes: Buffer.concat([header, body]), count: frame.count }
}

for (const showcaseId of Object.keys(exportNames)) {
  const result = buildPly(showcaseId)
  const outputPath = path.join(outputDir, result.fileName)
  writeFileSync(outputPath, result.bytes)
  console.log(`OK ${result.fileName}: ${result.count.toLocaleString('en-US')} points, ${(result.bytes.length / 1024).toFixed(1)} KB`)
}
