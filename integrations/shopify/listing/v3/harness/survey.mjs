// Quick look at candidate models in the viewer with the listing's scene settings:
//   PW=… node survey.mjs <outDir> [az] [el] [fill]
const { chromium } = await import(process.env.PW || 'playwright-core')
const [dir, az = 215, el = 16, fill = 0.8] = process.argv.slice(2)
const M = 'https://www.ifcvieweronline.eu/'
const models = {
  shanghai: M + 'models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc',
  swfc: M + 'models/swfc/SHA-IVO-SWFC-A-0001.ifc',
  pearl: M + 'models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc',
  torre: M + 'models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc',
  cras: M + 'models/cras/model.ifc',
  velaM: M + 'models/hotel-vela/BCN-IVO-ZZ-XX-M3-M-0002.ifc',
}
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
await Promise.all(Object.entries(models).map(async ([k, url]) => {
  const page = await browser.newPage({ viewport: { width: 900, height: 660 }, deviceScaleFactor: 1 })
  await page.goto('http://127.0.0.1:8732/')
  await page.setContent(`<div id="v" style="width:900px;height:660px"></div><script type="module">
    import { IfcViewer } from '${M}sdk/1.19.0/ifc-viewer.es.js'
    const v = new IfcViewer(document.getElementById('v'), { model: ${JSON.stringify(url)}, ui: 'kiosk', lang: 'en', validate: false, background: { top: '#f4f1ea', bottom: '#e4dfd3' }, height: '100%' })
    v.on('model-loaded', () => { window.__v = v }); v.whenReady().then(() => { window.__r = 1 })
  </script>`)
  try {
    await page.waitForFunction(() => !!window.__v, null, { timeout: 400000 })
    await page.waitForTimeout(4000)
    await page.evaluate(async (o) => { await window.__v.setRenderQuality('quality').catch(() => {}); await window.__v.frame({ view: 'iso', animate: false, ...o }) }, { azimuth: +az, elevation: +el, fill: +fill })
    await page.waitForTimeout(4000)
    await page.screenshot({ path: `${dir}/${k}.png` })
  } catch (e) { console.log(k, e.message.split('\n')[0]) }
  await page.close()
}))
await browser.close()
