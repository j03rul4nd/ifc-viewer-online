// Join time-windows of several recordings (scripts/gif/out/<scene>.webm) into one GIF.
//   node scripts/gif/montage.mjs out=demo.gif width=720 fps=8 colors=128 hero:28:44:2 twin:50:58:1.5 …
// Each segment is <scene>:<start>:<end>:<frames per real second>.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import gifenc from 'gifenc'
const { GIFEncoder, quantize, applyPalette } = gifenc

const FF = 'C:\\Users\\joelb\\AppData\\Local\\ms-playwright\\ffmpeg-1011\\ffmpeg-win64.exe'
const args = process.argv.slice(2)
const o = Object.fromEntries(args.filter((a) => a.includes('=')).map((s) => s.split('=')))
const segments = args.filter((a) => !a.includes('=')).map((s) => { const [scene, a, b, r] = s.split(':'); return { scene, a: +a, b: +b, r: +r } })
const width = +(o.width || 720), fps = +(o.fps || 8), colors = +(o.colors || 128), out = o.out || 'demo.gif'

const gif = GIFEncoder()
for (const [k, s] of segments.entries()) {
  const TMP = `scripts/gif/_tmp_montage_${k}`
  rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true })
  execFileSync(FF, ['-y', '-ss', String(s.a), '-to', String(s.b), '-i', `scripts/gif/out/${s.scene}.webm`,
    '-r', String(s.r), '-vf', `scale=${width}:-2:flags=lanczos`, `${TMP}/f_%04d.png`], { stdio: 'pipe' })
  const files = readdirSync(TMP).filter((f) => f.endsWith('.png')).sort()
  for (const f of files) {
    const png = PNG.sync.read(readFileSync(`${TMP}/${f}`))
    const data = new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.length)
    const palette = quantize(data, colors, { format: 'rgba4444' })
    gif.writeFrame(applyPalette(data, palette, 'rgba4444'), png.width, png.height, { palette, delay: Math.round(1000 / fps) })
  }
  rmSync(TMP, { recursive: true, force: true })
  console.log(`${s.scene} ${s.a}-${s.b}s: ${files.length} frames`)
}
gif.finish()
mkdirSync('scripts/gif/dist', { recursive: true })
writeFileSync(`scripts/gif/dist/${out}`, Buffer.from(gif.bytes()))
console.log(`OK scripts/gif/dist/${out} ${(gif.bytes().length / 1024).toFixed(0)} KB`)
