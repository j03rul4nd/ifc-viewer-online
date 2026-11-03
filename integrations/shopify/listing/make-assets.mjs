// Images for the Shopify App Store listing: icon 1200x1200, feature image and
// screenshots 1600x900. Needs Edge and network access to the live viewer.
//   node integrations/shopify/listing/make-assets.mjs
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = dirname(fileURLToPath(import.meta.url))
const accent = '#0A8481'
const M = 'https://www.ifcvieweronline.eu/models/barcelona-catalunya/'
const viewer = (models, extra = '') =>
  `https://www.ifcvieweronline.eu/?embed=1&ui=kiosk&view=iso${extra}&model=` + models.map((m) => encodeURIComponent(M + m + '.ifc')).join(',')

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ locale: 'en-US' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function shoot(name, width, height, html, settle = 300) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height })
  await page.setContent(html, { waitUntil: 'load' })
  await wait(settle)
  await page.screenshot({ path: join(out, name) })
  await page.close()
}

// Shopify asks for a full square: no rounded corners, no text.
await shoot('icon-1200x1200.png', 1200, 1200, `<body style="margin:0;background:${accent}">
<svg width="1200" height="1200" viewBox="0 0 32 32"><path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="white" stroke-width="1.5" fill="none" stroke-linejoin="round"/></svg></body>`)

// The viewer is captured on its own page and composed as an image: WebGL inside
// an iframe of a setContent page renders black.
async function capture(src, width, height) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height })
  await page.goto(src)
  await wait(15000)
  const png = await page.screenshot()
  await page.close()
  return `<img src="data:image/png;base64,${png.toString('base64')}" style="width:100%;height:100%;display:block;border-radius:16px;object-fit:cover">`
}
const font = 'font-family:Inter,Segoe UI,system-ui,sans-serif'

await shoot('feature-1600x900.png', 1600, 900, `<body style="margin:0;${font};background:#0f1416;color:#fff;display:grid;grid-template-columns:620px 1fr;height:900px">
<div style="padding:110px 64px"><div style="width:72px;height:72px;border-radius:16px;background:${accent}"></div>
<h1 style="font-size:58px;line-height:1.08;margin:40px 0 24px">The BIM page for every building product</h1>
<p style="font-size:26px;line-height:1.45;color:#b9c6c9">3D IFC model per product and variant, download for architects, technical data and Health Score.</p></div>
<div style="padding:48px 48px 48px 0">${await capture(viewer(['catalunya-mobility-hub', 'falques-bench-lamps'], '&validate=0'), 932, 804)}</div></body>`)

// A product page as a building-products store would set it up.
const product = (title, price, shot, specs) => `<body style="margin:0;${font};background:#fff;color:#1b1f21">
<div style="height:64px;border-bottom:1px solid #e6e8e9;display:flex;align-items:center;padding:0 48px;font-weight:700;font-size:20px">Urban Furniture Co.</div>
<div style="display:grid;grid-template-columns:1fr 520px;gap:48px;padding:40px 48px">
<div style="height:640px">${shot}</div>
<div><h1 style="font-size:36px;margin:0 0 8px">${title}</h1><p style="font-size:22px;margin:0 0 24px">${price}</p>
<div style="display:flex;gap:8px;margin-bottom:24px">${['Steel', 'Corten', 'Wood'].map((v, i) => `<span style="padding:10px 16px;border-radius:999px;border:1px solid ${i ? '#cfd4d6' : '#1b1f21'}">${v}</span>`).join('')}</div>
<div style="background:#1b1f21;color:#fff;text-align:center;padding:16px;border-radius:8px;font-weight:600;margin-bottom:20px">Request a quote</div>
<a style="color:${accent};font-weight:600">Download BIM model (IFC)</a>
<ul style="margin:8px 0 20px;padding-left:20px;color:#4b5356"><li>product.rfa</li><li>datasheet.pdf</li></ul>
<table style="width:100%;border-collapse:collapse;font-size:17px"><caption style="text-align:left;font-weight:600;padding-bottom:6px">Technical data</caption>
${specs.map(([k, v]) => `<tr><th style="text-align:left;font-weight:400;padding:8px 0;border-top:1px solid #e6e8e9">${k}</th><td style="border-top:1px solid #e6e8e9">${v}</td></tr>`).join('')}</table></div></div></body>`

await shoot('screenshot-1-product.png', 1600, 900, product('Bench with lamps', '€1,240.00', await capture(viewer(['falques-bench-lamps']), 936, 640), [['Length', '2,400 mm'], ['Material', 'Galvanised steel'], ['Lighting', 'LED 3000 K'], ['Fire rating', 'A1']]))
await shoot('screenshot-2-charger.png', 1600, 900, product('EV charging point', '€3,980.00', await capture(viewer(['endolla-pg-gracia']), 936, 640), [['Power', '22 kW'], ['Connectors', 'Type 2 ×2'], ['Protection', 'IP54'], ['Height', '1,450 mm']]))

await browser.close()
