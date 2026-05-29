// Encode a webm time-window into an optimized GIF.
//   node scripts/gif/encode.mjs <scene> <start> <end> [opts as key=val]
// opts: out=name.gif width=1000 fps=12 sample=12 crop=W:H:X:Y maxColors=256
// - sample = PNG frames extracted per real second (from the webm)
// - fps    = GIF playback rate (fps>sample => sped up; fps<sample => slowed)
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import gifenc from 'gifenc'
const { GIFEncoder, quantize, applyPalette } = gifenc

const FF = 'C:\\Users\\joelb\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe'
const [scene, startS, endS, ...rest] = process.argv.slice(2)
const o = Object.fromEntries(rest.map((s) => s.split('=')))
const width = +(o.width || 1000)
const fps = +(o.fps || 12)
const sample = +(o.sample || 12)
const maxColors = +(o.maxColors || 256)
const out = o.out || `${scene}.gif`
const start = +startS, end = +endS

const TMP = `scripts/gif/_tmp_${scene}`
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true })

// scale (and optional crop) — only crop/scale filters exist in this ffmpeg build
let vf = ''
if (o.crop) vf += `crop=${o.crop},`
vf += `scale=${width}:-2:flags=lanczos`

execFileSync(FF, ['-y', '-ss', String(start), '-to', String(end),
  '-i', `scripts/gif/out/${scene}.webm`, '-r', String(sample), '-vf', vf,
  `${TMP}/f_%04d.png`], { stdio: 'pipe' })

const files = readdirSync(TMP).filter((f) => f.endsWith('.png')).sort()
if (!files.length) { console.error('no frames extracted'); process.exit(1) }

const gif = GIFEncoder()
const delay = Math.round(1000 / fps)
let W = 0, H = 0
for (const f of files) {
  const png = PNG.sync.read(readFileSync(`${TMP}/${f}`))
  W = png.width; H = png.height
  const data = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length)
  const palette = quantize(data, maxColors, { format: 'rgba4444' })
  const index = applyPalette(data, palette, 'rgba4444')
  gif.writeFrame(index, W, H, { palette, delay })
}
gif.finish()
const outPath = `scripts/gif/dist/${out}`
mkdirSync('scripts/gif/dist', { recursive: true })
writeFileSync(outPath, Buffer.from(gif.bytes()))
rmSync(TMP, { recursive: true, force: true })
const kb = (readFileSync(outPath).length / 1024).toFixed(0)
console.log(`OK ${outPath}  ${W}x${H}  ${files.length} frames @ ${fps}fps  ${kb} KB`)
