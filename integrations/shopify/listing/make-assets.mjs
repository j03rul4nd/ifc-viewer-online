// Images for the Shopify App Store listing, following Shopify's listing guidance:
// icon 1200x1200 with padding and no text; feature image 1600x900 with one focal
// point on a solid background; 3–6 distinct 1600x900 screenshots of the real UI,
// no browser windows, no prices in captions. Colours are the site's own tokens
// (concrete neutrals, verdigris accent), not a template palette.
// Needs Edge and network access to the live viewer.
//   node integrations/shopify/listing/make-assets.mjs
import { chromium } from 'playwright-core'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const out = dirname(fileURLToPath(import.meta.url))
const accent = '#0a8481'
const ink = '#1d1c19'
const concrete = '#e9e7e1'
const muted = '#5d5a52'
// Single quotes: the font names go inside style="…" attributes.
const font = "font-family:'Segoe UI Variable Display','Segoe UI',system-ui,sans-serif"
const B = 'https://www.ifcvieweronline.eu/models/'
const MODELS = {
  station: 'helsinki/helsinki-central-station.ifc',
  vela: 'hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc',
  tram: 'tokyo/waseda-tram-stop.ifc',
  bench: 'barcelona-catalunya/falques-bench-lamps.ifc',
}
const viewer = (model, extra = '') =>
  `https://www.ifcvieweronline.eu/?embed=1&ui=kiosk&view=iso&validate=0${extra}&model=${encodeURIComponent(B + MODELS[model])}`

const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ locale: 'en-US' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** A real capture of the viewer, framed with a drag (orbit) and wheel steps (zoom). */
async function capture(src, width, height, { drag = [0, 0], zoom = 0, settle = 25000 } = {}) {
  const page = await ctx.newPage()
  await page.setViewportSize({ width, height })
  await page.goto(src)
  // A fresh browser is asked before map tiles load.
  await page.getByRole('button', { name: 'Enable map' }).click({ timeout: 20000 }).catch(() => {})
  await wait(settle)
  const cx = width / 2, cy = height / 2
  if (drag[0] || drag[1]) {
    await page.mouse.move(cx, cy); await page.mouse.down()
    await page.mouse.move(cx + drag[0], cy + drag[1], { steps: 24 }); await page.mouse.up()
  }
  for (let i = 0; i < zoom; i++) { await page.mouse.wheel(0, -200); await wait(120) }
  await wait(3000)
  const png = (await page.screenshot()).toString('base64')
  await page.close()
  return `data:image/png;base64,${png}`
}

async function shoot(name, html) {
  const icon = name.startsWith('icon')
  const page = await ctx.newPage()
  await page.setViewportSize({ width: icon ? 1200 : 1600, height: icon ? 1200 : 900 })
  await page.setContent(html, { waitUntil: 'load' })
  await wait(400)
  await page.screenshot({ path: join(out, name) })
  await page.close()
}

const mark = (size, color = '#fff') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M8 22 L16 8 L24 22 Z M12 22 L16 15 L20 22" stroke="${color}" stroke-width="1.6" fill="none" stroke-linejoin="round"/></svg>`

// Icon: the mark with room around it, because Shopify rounds the corners.
await shoot('icon-1200x1200.png', `<body style="margin:0;background:${accent};display:grid;place-items:center;height:1200px">${mark(760)}</body>`)

/** Caption on the left, real UI on the right: one idea per image. */
const slide = (title, body, ui) => `<body style="margin:0;${font};width:1600px;height:900px;overflow:hidden;
background:${concrete};color:${ink};display:grid;grid-template-columns:520px 1fr">
<div style="padding:96px 56px 0 72px;display:flex;flex-direction:column;gap:22px">
  <div style="width:40px;height:4px;background:${accent}"></div>
  <h1 style="margin:0;font-size:52px;line-height:1.08;font-weight:650;letter-spacing:-0.02em">${title}</h1>
  <p style="margin:0;font-size:23px;line-height:1.5;color:${muted}">${body}</p>
</div>
<div style="padding:56px 56px 56px 0;display:flex;align-items:center">${ui}</div></body>`

// `scale` enlarges the centre of a capture: wheel zoom heads for the cursor, not the model.
const img = (src, h = 788, r = 14, scale = 1) => `<div style="height:${h}px;overflow:hidden;border-radius:${r}px"><img src="${src}" style="width:100%;height:100%;object-fit:cover;display:block;transform:scale(${scale})"></div>`
const rows = (specs) => specs.map(([k, v]) => `<tr><td style="padding:8px 0;border-top:1px solid #ecebe7;color:${muted}">${k}</td><td style="border-top:1px solid #ecebe7;text-align:right">${v}</td></tr>`).join('')

/** A store's product page: what the merchant's customers see, with the block in it. */
const productPage = (shot, { title, variants, specs }) => `<div style="width:100%;background:#fff;border-radius:14px;overflow:hidden">
<div style="height:56px;border-bottom:1px solid #ecebe7;display:flex;align-items:center;padding:0 28px;font-weight:650;font-size:17px;color:${ink}">Northline Building Products</div>
<div style="display:grid;grid-template-columns:1fr 330px;gap:28px;padding:24px 28px 28px">
<div>${img(shot, 560, 10)}</div>
<div style="font-size:15px;color:${ink}"><div style="font-size:26px;font-weight:650;margin-bottom:14px">${title}</div>
<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">${variants.map((v, i) => `<span style="padding:8px 14px;border-radius:999px;border:1.5px solid ${i === 0 ? ink : '#d6d3cb'}">${v}</span>`).join('')}</div>
<div style="background:${ink};color:#fff;text-align:center;padding:13px;border-radius:8px;font-weight:600;margin-bottom:18px">Request a quote</div>
<div style="color:${accent};font-weight:600;margin-bottom:6px">Download BIM model (IFC)</div>
<div style="color:${muted};line-height:1.7">↓ revit-family.rfa<br>↓ datasheet.pdf</div>
<div style="margin-top:16px;font-weight:600">Technical data</div><table style="width:100%;border-collapse:collapse;margin-top:6px">${rows(specs)}</table>
</div></div></div>`

const stationMap = await capture(viewer('station', '&map=terrain,buildings,showcase&look=golden'), 1180, 900, { drag: [-140, -40], zoom: 1, settle: 60000 })
await shoot('feature-1600x900.png', `<body style="margin:0;${font};width:1600px;height:900px;background:#151513;color:#f1efe9;position:relative;overflow:hidden">
<img src="${stationMap}" style="position:absolute;right:0;top:0;width:1180px;height:900px;object-fit:cover">
<div style="position:absolute;left:420px;top:0;bottom:0;width:180px;background:linear-gradient(90deg,#151513,rgba(21,21,19,0))"></div>
<div style="position:absolute;left:80px;top:300px;width:440px">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:34px">${mark(44, '#55cac3')}<span style="font-size:22px;font-weight:600;color:#b8b4a9">IFC Viewer Online</span></div>
  <div style="font-size:60px;line-height:1.05;font-weight:650;letter-spacing:-0.025em">The BIM model, on the product page.</div>
</div></body>`)

const vela = await capture(viewer('vela', '&bg=paper'), 900, 560, { drag: [140, -20], zoom: 1 })
await shoot('screenshot-1-product-page.png', slide('One block. Every product.',
  'Add the block to your product template once. Each product shows its own IFC model from a metafield.',
  productPage(vela, { title: 'Curtain wall system CW-50', variants: ['Anodised', 'Bronze', 'Black'], specs: [['U-value', '1.1 W/m²K'], ['Fire rating', 'EI 30'], ['Max. height', '4,200 mm']] })))

const tram = await capture(viewer('tram', '&bg=paper'), 1000, 1280)
const bench = await capture(viewer('bench', '&bg=paper'), 1000, 1280)
await shoot('screenshot-2-variants.png', slide('Each variant, its own model.',
  'Switch the variant and the 3D model and download link follow. Variants without a file show the product’s.',
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;width:100%">
  <div><div style="font-size:17px;font-weight:600;margin-bottom:10px">Variant: Shelter, 4 bays</div>${img(tram, 640, 14, 1.9)}</div>
  <div><div style="font-size:17px;font-weight:600;margin-bottom:10px">Variant: Bench with lamps</div>${img(bench, 640, 14, 2.6)}</div></div>`))

await shoot('screenshot-3-downloads.png', slide('What specifiers come for.',
  'IFC download, more files from a list metafield (RFA, DWG, PDF) and a technical data table from your own metafields.',
  `<div style="background:#fff;border-radius:14px;padding:44px 52px;width:100%;font-size:20px;color:${ink}">
  <div style="font-size:30px;font-weight:650;margin-bottom:26px">Curtain wall system CW-50</div>
  <div style="color:${accent};font-weight:650;font-size:22px;margin-bottom:12px">Download BIM model (IFC)</div>
  <div style="color:${muted};line-height:1.9;margin-bottom:30px">↓ cw-50-revit-family.rfa<br>↓ cw-50-details.dwg<br>↓ cw-50-datasheet.pdf</div>
  <div style="font-weight:650;margin-bottom:8px">Technical data</div>
  <table style="width:100%;border-collapse:collapse">${rows([['U-value', '1.1 W/m²K'], ['Fire rating', 'EI 30'], ['Acoustic insulation', '42 dB'], ['Max. height', '4,200 mm'], ['Profile depth', '150 mm']])}</table></div>`))

const phone = await capture(viewer('station', '&bg=paper'), 390, 520, { drag: [-60, -10], zoom: 0 })
const phoneCard = (inner) => `<div style="width:370px;background:#fff;border-radius:28px;overflow:hidden;border:10px solid ${ink}">${inner}
  <div style="padding:18px;font-size:15px"><div style="font-weight:650;font-size:19px;margin-bottom:6px">Station canopy kit</div><div style="color:${accent};font-weight:600">Download BIM model (IFC)</div></div></div>`
await shoot('screenshot-4-mobile.png', slide('Fast on phones.',
  'The viewer opens on tap over your product image, so the page loads as fast as without it.',
  `<div style="display:flex;gap:36px;align-items:center;justify-content:center;width:100%">
  ${phoneCard(`<div style="height:520px;position:relative;background:#f4f3ef;display:grid;place-items:center">
      <div style="position:absolute;inset:0;background:url('${phone}') center/cover;opacity:.35"></div>
      <span style="position:relative;background:#fff;border:1.5px solid ${ink};padding:12px 22px;border-radius:999px;font-weight:600;font-size:17px">View in 3D</span></div>`)}
  <div style="font-size:46px;color:${muted}">→</div>
  ${phoneCard(img(phone, 520, 0))}</div>`))

// The full viewer on the Lujiazui skyline: the three Shanghai towers on the map,
// the model tree, one curtain wall selected with its IFC data, the score below.
async function inspect() {
  const models = ['shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc', 'oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc', 'swfc/SHA-IVO-SWFC-A-0001.ifc']
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.goto(`https://www.ifcvieweronline.eu/?model=${models.map((m) => encodeURIComponent(B + m)).join(',')}&tree=1&map=terrain,buildings,showcase`)
  await page.getByRole('button', { name: 'Enable map' }).click({ timeout: 30000 }).catch(() => {})
  await wait(70000)
  for (const x of await page.getByRole('button', { name: /close|dismiss/i }).all()) await x.click({ timeout: 1000 }).catch(() => {})
  await page.mouse.click(1576, 596) // collapse the validation panel to its bar
  await wait(3000)
  // The tree sometimes opens collapsed to its rail.
  if (!(await page.getByText('3 MODELS').isVisible().catch(() => false))) {
    await page.getByText(/spatial tree/i).first().click().catch(() => {})
    await wait(1500)
  }
  // Select through the tree's search: clicks on the map can land on map buildings.
  await page.getByPlaceholder(/search elements/i).fill('silver-blue glazed envelope')
  await wait(2500)
  await page.getByText(/silver-blue glazed envelope/i).first().click()
  await wait(3000)
  const png = (await page.screenshot()).toString('base64')
  await page.close()
  return `data:image/png;base64,${png}`
}
const inspected = await inspect()
await shoot('screenshot-5-inspect.png', `<body style="margin:0;${font};width:1600px;height:900px;overflow:hidden;background:${concrete};color:${ink}">
<div style="height:150px;display:flex;align-items:center;gap:28px;padding:0 72px">
  <div style="width:40px;height:4px;background:${accent}"></div>
  <h1 style="margin:0;font-size:46px;font-weight:650;letter-spacing:-0.02em">Every element, every property.</h1>
  <p style="margin:0 0 0 auto;max-width:520px;font-size:21px;line-height:1.45;color:${muted}">Model tree, IFC data, materials and the Health Score, on the real site.</p>
</div>
<div style="margin:0 56px;height:750px;overflow:hidden;border-radius:14px 14px 0 0"><img src="${inspected}" style="width:100%;display:block"></div></body>`)

await browser.close()
