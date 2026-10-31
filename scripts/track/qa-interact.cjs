// Behaviour of the widget and the configurator in a real browser.
//   node scripts/track/qa-interact.cjs <public base> <out dir>
const { chromium } = require('playwright-core')
const path = require('path')
const [BASE = 'http://localhost:5190', OUT = '.'] = process.argv.slice(2)
const ok = (name, pass, extra = '') => console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${extra}`)
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url')

;(async () => {
  const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'])
  const p = await ctx.newPage()
  const errors = []; p.on('pageerror', e => errors.push(String(e))); p.on('console', m => { if (m.type() === 'error' && !/404/.test(m.text())) errors.push(m.text()) })
  const R = fn => p.evaluate(fn)
  const widget = async (cfg, attrs = '') => {
    await p.goto(`${BASE}/track/v1/embed.html`)
    await p.setContent(`<!doctype html><html lang="en"><body style="margin:0"><tracking-globe id="g" config="${enc(cfg)}" ${attrs} style="display:block;height:560px"></tracking-globe></body></html>`)
    await p.addScriptTag({ url: `${BASE}/track/v1/tracker.js` })
    await p.waitForFunction(() => document.getElementById('g').shadowRoot?.querySelector('.w'))
    await p.waitForTimeout(400)
  }
  const inner = q => `document.getElementById('g').shadowRoot.querySelector(${JSON.stringify(q)})`

  // Real data from a feed, with a carrier's field names
  await widget({ feed: `${BASE}/feed.json`, title: 'Real' })
  await p.waitForTimeout(500)
  ok('feed renders the host data', await p.evaluate(`${inner('.it')}?.dataset.id`) === 'REAL-1')
  ok('real data has no simulated label', await p.evaluate(`!${inner('.sim')}`))

  // A broken feed says so instead of dying
  await widget({ feed: `${BASE}/nope.json` }); await p.waitForTimeout(500)
  ok('broken feed shows a notice', await p.evaluate(`!!${inner('.er')}`))
  errors.length = 0

  const demo = [{ id: 'A', from: 'shanghai', to: 'rotterdam', mode: 'sea', status: 'transit', progress: .5 }, { id: 'B', from: 'hkg', to: 'fra', mode: 'air', status: 'delivered' }, { id: 'C', from: 'Atlantis', to: 'fra', mode: 'air' }]
  await widget({ shipments: demo, simulate: true })
  ok('simulation label is shown', await p.evaluate(`!!${inner('.sim')}`))
  ok('unknown place does not break the list', await p.evaluate(`${inner('[data-id=C] .r2')}.textContent.length>0`))

  // Selecting flies there and tells the host
  await p.evaluate(`window.__sel=null;document.getElementById('g').addEventListener('tg-select',e=>window.__sel=e.detail.id);${inner('[data-id=A]')}.click()`)
  await p.waitForTimeout(900)
  ok('list click selects and emits', await p.evaluate('window.__sel') === 'A')

  // Globe to map, drawing something
  await p.evaluate(`document.getElementById('g').setView('map')`); await p.waitForTimeout(400)
  await p.screenshot({ path: path.join(OUT, 'map.png') })
  ok('map view hides the sphere', await p.evaluate(`getComputedStyle(${inner('.c1')}).display`) === 'none')

  // Search filters
  await p.evaluate(`const i=${inner('input')};i.value='B';i.dispatchEvent(new Event('input'))`)
  ok('search filters the list', await p.evaluate(`document.getElementById('g').shadowRoot.querySelectorAll('.it').length`) === 1)

  // The wheel belongs to the page
  await p.setContent(`<!doctype html><body style="margin:0;height:3000px"><div style="height:100px"></div><tracking-globe id="g" config="${enc({ shipments: demo })}" style="display:block;height:560px"></tracking-globe></body>`)
  await p.addScriptTag({ url: `${BASE}/track/v1/tracker.js` }); await p.waitForFunction(() => document.getElementById('g').shadowRoot?.querySelector('.w'))
  await p.mouse.move(300, 300); await p.mouse.wheel(0, 300); await p.waitForTimeout(300)
  ok('wheel scrolls the host page', await R(() => scrollY) > 0)
  await p.evaluate(() => scrollTo(0, 0))

  // No work off-screen
  await p.evaluate(() => scrollTo(0, 2400)); await p.waitForTimeout(500)
  const frames = await p.evaluate(() => new Promise(res => { const orig = WebGLRenderingContext.prototype.drawArrays; let n = 0; WebGLRenderingContext.prototype.drawArrays = function (...a) { n++; return orig.apply(this, a) }; setTimeout(() => { WebGLRenderingContext.prototype.drawArrays = orig; res(n) }, 1500) }))
  ok('off-screen: no draws', frames === 0, `(${frames})`)

  // Controls and colours are honoured; hostile values are not
  await widget({ shipments: demo, controls: { list: false, zoom: false, viewSwitch: false, fullscreen: false, legend: false }, theme: { preset: 'light', accent: 'red;}*{display:none', background: '#fff5e6' } })
  ok('hidden controls stay hidden', await p.evaluate(`getComputedStyle(${inner('.pn')}).display==='none' && !${inner('.tb button')}`))
  ok('hostile colour ignored, background applied', await p.evaluate(`!${inner('.th')}.textContent.includes('display:none') && ${inner('.th')}.textContent.includes('#fff5e6')`))
  await p.screenshot({ path: path.join(OUT, 'light.png') })

  // Host stylesheet beats the configured colour
  await p.addStyleTag({ content: 'tracking-globe{--tg-background:#123456}' })
  ok('host CSS overrides config', await p.evaluate(`getComputedStyle(${inner('.w')}).backgroundColor`) === 'rgb(18, 52, 86)')

  // Without WebGL it still shows the map
  await p.addInitScript(() => { HTMLCanvasElement.prototype.getContext = (o => function (t, ...a) { return t === 'webgl' ? null : o.call(this, t, ...a) })(HTMLCanvasElement.prototype.getContext) })
  await widget({ shipments: demo })
  ok('no WebGL falls back to the map', await p.evaluate(`getComputedStyle(${inner('.c1')}).display`) === 'none')
  const p2Errors = errors.length

  // Configurator
  const c = await ctx.newPage(); const cErr = []; c.on('pageerror', e => cErr.push(String(e)))
  await c.goto(`${BASE}/es/tracking-globe/`); await c.waitForTimeout(1200)
  ok('configurator: snippet generated', (await c.textContent('[data-out=html]')).includes('<tracking-globe config='))
  await c.selectOption('#source', 'paste')
  await c.fill('#pasted', 'id;from;to;mode;status;progress\nPO-1;shanghai;valencia;sea;transit;0.4\nPO-2;hkg;bcn;air;delayed;0.8')
  await c.waitForTimeout(500)
  ok('configurator: CSV read', (await c.textContent('#count')) === '2')
  ok('configurator: warns data is public', await c.isVisible('#warn-public'))
  const code = (await c.textContent('[data-out=html]')).match(/config="([\w-]+)"/)[1]
  const dec = JSON.parse(Buffer.from(code, 'base64url').toString())
  ok('configurator: real data is not marked simulated', !dec.simulate && dec.shipments.length === 2)
  await c.fill('[data-k=title]', 'Marca X'); await c.selectOption('[data-k="theme.preset"]', 'light'); await c.waitForTimeout(500)
  ok('configurator: preview follows', await c.evaluate(() => document.getElementById('tg-preview').shadowRoot.querySelector('.hd b')?.textContent) === 'Marca X')
  await c.click('[role=tab][data-tab=sharepoint]')
  ok('configurator: SharePoint tab gives the domain', (await c.textContent('[data-out=sharepointDomain]')) === 'localhost')
  await c.click('[role=tab][data-tab=taobao]')
  const [dl] = await Promise.all([c.waitForEvent('download'), c.click('#png')])
  await dl.saveAs(path.join(OUT, 'taobao.png'))
  ok('configurator: PNG downloaded', dl.suggestedFilename().endsWith('.png'))
  await c.click('[role=tab][data-tab=html]'); await c.click('[data-copy=html]')
  ok('configurator: copy works', (await c.evaluate(() => navigator.clipboard.readText())).includes('tracker.js'))
  await c.waitForTimeout(300); await c.screenshot({ path: path.join(OUT, 'configurator.png'), fullPage: false })
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const mp = await m.newPage()
  await mp.goto(`${BASE}/tracking-globe/`); await mp.waitForTimeout(1500)
  ok('configurator phone: no sideways scroll', await mp.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await mp.screenshot({ path: path.join(OUT, 'configurator-phone.png') })
  console.log('page errors:', p2Errors, errors.slice(0, 3), cErr.slice(0, 3))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
