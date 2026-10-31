// Device mockups for the foldable article: real captures of the viewer
// (capture-foldable-shots.mjs) on a generic foldable drawn in CSS. No brand and
// no real product: it is an illustration, and the captions say so.
//
// Usage: node scripts/og/build-foldable-mockups.mjs
// Input: scripts/og/foldable-raw/<name>.jpg. Output: public/blog/images/<name>[-800].jpg

import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const EXE = process.env.CHROME_EXE || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = 'public/blog/images'
const raw = (name) => `data:image/jpeg;base64,${readFileSync(`scripts/og/foldable-raw/${name}.jpg`).toString('base64')}`

const BASE = `*{box-sizing:border-box;margin:0}html,body{width:100%;height:100%;overflow:hidden}
body{background:radial-gradient(90% 80% at 50% 30%,#4a4f63,#1a1c25);display:flex;align-items:center;justify-content:center;perspective:1500px}
.half{position:absolute;background:#17181d;border:1px solid #3a3c46;box-shadow:inset 0 0 0 1px #000}
.screen{position:absolute;inset:7px;border-radius:9px;background-repeat:no-repeat;overflow:hidden}
.screen::after{content:'';position:absolute;inset:0}`

// Two 540x720 screens, each half of the capture, opened like a book.
const book = (img) => `<style>${BASE}
.d{position:relative;width:1000px;height:640px;transform-style:preserve-3d;transform:scale(.84) rotateX(5deg)}
.half{top:0;width:500px;height:640px}
.l{left:0;border-radius:20px 4px 4px 20px;transform-origin:right center;transform:rotateY(22deg)}
.r{right:0;border-radius:4px 20px 20px 4px;transform-origin:left center;transform:rotateY(-22deg)}
.screen{background-image:url(${img});background-size:${486 * 1114 / 540}px auto}
.l .screen{background-position:left top}.r .screen{background-position:right top}
.l .screen::after{background:linear-gradient(90deg,transparent 70%,rgba(0,0,0,.28))}
.r .screen::after{background:linear-gradient(270deg,transparent 70%,rgba(255,255,255,.04))}
.shadow{position:absolute;left:6%;right:6%;bottom:-46px;height:46px;background:radial-gradient(closest-side,rgba(0,0,0,.65),transparent);transform:translateZ(-60px)}
</style><div class="d"><div class="half l"><div class="screen"></div></div><div class="half r"><div class="screen"></div></div><div class="shadow"></div></div>`

// Two 720x440 screens, the lower one lying on a table.
const tabletop = (img) => `<style>${BASE}
body{background:linear-gradient(#454a5d 0 52%,#23252f 52%);perspective:1300px}
.d{position:relative;width:600px;height:366px;transform-style:preserve-3d;margin-top:-250px;transform:scale(.82)}
.half{left:0;width:600px;height:366px}
.t{top:0;border-radius:20px 20px 4px 4px;transform-origin:center bottom;transform:rotateX(-6deg)}
.b{top:366px;border-radius:4px 4px 20px 20px;transform-origin:center top;transform:rotateX(52deg)}
.screen{background-image:url(${img});background-size:586px auto}
.t .screen{background-position:center top}.b .screen{background-position:center bottom}
.shadow{position:absolute;left:-3%;right:-3%;top:640px;height:70px;background:radial-gradient(closest-side,rgba(0,0,0,.7),transparent)}
</style><div class="d"><div class="half t"><div class="screen"></div></div><div class="half b"><div class="screen"></div></div><div class="shadow"></div></div>`

const SHOTS = [
  { name: 'foldable-ifc-viewer-book-posture', width: 1114, height: 720, html: book },
  { name: 'foldable-ifc-viewer-tabletop-posture', width: 720, height: 900, html: tabletop },
]

const browser = await chromium.launch({ executablePath: EXE })
try {
  for (const s of SHOTS) {
    for (const scale of [2, 800 / s.width]) {
      const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: scale })
      await page.setContent(s.html(raw(s.name)), { waitUntil: 'load' })
      await page.screenshot({ path: `${OUT}/${s.name}${scale === 2 ? '' : '-800'}.jpg`, type: 'jpeg', quality: 88 })
      await page.close()
    }
  }
} finally {
  await browser.close()
}
