// Encodes the captures of capture.cjs for the web: for every <name>.png in the
// folder it writes <name>.jpg (the file search engines index) and two .webp
// renditions, <name>-<width>.webp at full and half width (what browsers load).
//
//   node scripts/seo/core-landings/encode.cjs <dir>
//
// There is no image library in this project, so the encoding is done by the
// canvas of the same local Chrome that took the captures.
const { chromium } = require('playwright-core')
const { readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const dir = process.argv[2]

;(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
  const p = await b.newPage()
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.png') && !f.includes('FAILED'))) {
    const png = `data:image/png;base64,${readFileSync(join(dir, name)).toString('base64')}`
    const out = await p.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const encode = (w, type, q) => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = Math.round((img.naturalHeight * w) / img.naturalWidth)
        const g = c.getContext('2d')
        g.imageSmoothingQuality = 'high'
        g.drawImage(img, 0, 0, c.width, c.height)
        return c.toDataURL(type, q).split(',')[1]
      }
      const w = img.naturalWidth
      return { w, jpg: encode(w, 'image/jpeg', 0.86), full: encode(w, 'image/webp', 0.82), half: encode(w / 2, 'image/webp', 0.82) }
    }, png)
    const base = name.replace(/\.png$/, '')
    writeFileSync(join(dir, `${base}.jpg`), Buffer.from(out.jpg, 'base64'))
    writeFileSync(join(dir, `${base}-${out.w}.webp`), Buffer.from(out.full, 'base64'))
    writeFileSync(join(dir, `${base}-${out.w / 2}.webp`), Buffer.from(out.half, 'base64'))
    console.log('encoded', base, out.w)
  }
  await b.close()
})()
