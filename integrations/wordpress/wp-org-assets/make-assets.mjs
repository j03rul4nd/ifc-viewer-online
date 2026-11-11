// Images for the wordpress.org plugin page (SVN /assets): icon, banner, screenshots.
// Needs the local WordPress from ../docker-compose.yml with the demo posts, and Edge.
//   node integrations/wordpress/wp-org-assets/make-assets.mjs <post-id> <twin-post-id>
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = dirname(fileURLToPath(import.meta.url))
const [post = '9', twinPost = '12'] = process.argv.slice(2)
const wp = 'http://localhost:8088'
const user = process.env.WP_USER || 'admin'
const pass = process.env.WP_PASS
const accent = '#0A8481'
const logo = (size) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${accent}"/><path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="white" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg>`
const viewer = 'https://www.ifcvieweronline.eu/?embed=1&ui=kiosk&validate=0&view=iso&map=terrain,buildings&look=golden&model=' +
  ['catalunya-mobility-hub', 'fonts-bessones'].map((m) => `https://www.ifcvieweronline.eu/models/barcelona-catalunya/${m}.ifc`).join(',')

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 860 } })

async function shoot(name, width, height, html) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height })
  await page.setContent(html)
  await wait(300)
  await page.screenshot({ path: join(out, name) })
  await page.close()
}

const icon = (s) => `<body style="margin:0">${logo(s)}</body>`
await shoot('icon-128x128.png', 128, 128, icon(128))
await shoot('icon-256x256.png', 256, 256, icon(256))

// The banner's 3D half is a real capture of the viewer, taken at the banner's size.
async function capture(width, height) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height })
  await page.goto(viewer)
  // A fresh browser is asked before map tiles load.
  await page.getByRole('button', { name: 'Enable map' }).click({ timeout: 20000 }).catch(() => {})
  await wait(30000)
  const png = (await page.screenshot()).toString('base64')
  await page.close()
  return `data:image/png;base64,${png}`
}

const banner = (w, h, shot) => {
  const k = w / 772
  return `<body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#0d1716;font-family:Segoe UI,system-ui,sans-serif;display:flex">
  <div style="flex:0 0 ${370 * k}px;padding:${40 * k}px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:${12 * k}px;color:#e8f1f0">
    ${logo(48 * k)}
    <div style="font-size:${30 * k}px;font-weight:650;letter-spacing:-0.01em">Bimo IFC Viewer</div>
    <div style="font-size:${15 * k}px;line-height:1.4;color:#a9bfbc">Interactive 3D BIM models in your posts and pages. Health Score, the map, sun studies and digital twins.</div>
  </div>
  <img src="${shot}" style="flex:1;min-width:0;height:100%;object-fit:cover"></body>`
}
const wide = await capture(1544 - 740, 500)
await shoot('banner-772x250.png', 772, 250, banner(772, 250, wide))
await shoot('banner-1544x500.png', 1544, 500, banner(1544, 500, wide))

// Screenshots from the local WordPress, numbered as in readme.txt.
const page = await ctx.newPage()
await page.goto(`${wp}/?p=${post}`)
await wait(20000)
await page.screenshot({ path: join(out, 'screenshot-1.png') })
await page.locator('iframe').nth(1).scrollIntoViewIfNeeded()
await wait(25000)
await page.screenshot({ path: join(out, 'screenshot-3.png') })
await page.goto(`${wp}/?p=${twinPost}`)
await page.locator('iframe').first().scrollIntoViewIfNeeded()
await wait(30000)
await page.screenshot({ path: join(out, 'screenshot-4.png') })

if (pass) {
  await page.goto(`${wp}/wp-login.php`)
  await page.fill('#user_login', user)
  await page.fill('#user_pass', pass)
  await page.click('#wp-submit')
  await page.goto(`${wp}/wp-admin/post.php?post=${post}&action=edit`)
  await page.waitForFunction(() => window.wp?.data?.select('core/block-editor')?.getBlocks().length)
  await page.evaluate(() => {
    const { data } = window.wp
    data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false)
    const blocks = data.select('core/block-editor').getBlocks().filter((b) => b.name === 'bimo-ifc-viewer/viewer')
    data.dispatch('core/block-editor').selectBlock(blocks[1].clientId)
    data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block')
  })
  await page.getByRole('button', { name: 'Site, sun and plans' }).click()
  await wait(25000)
  await page.screenshot({ path: join(out, 'screenshot-2.png') })
}
await browser.close()
