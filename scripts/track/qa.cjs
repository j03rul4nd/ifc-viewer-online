// End-to-end check of the embeds in a real browser: script load timing, weight,
// layout shift, third-party requests, per-platform example pages, desktop and phone.
//   node scripts/track/qa.cjs <examples base url> <out dir>
// Needs the examples served on the first origin and public/ on http://localhost:5190.
const { chromium } = require('playwright-core')
const fs = require('fs'), path = require('path')
const [BASE = 'http://localhost:5191', OUT = '.'] = process.argv.slice(2)
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'

const observe = () => {
  window.__cls = 0; window.__long = []
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
  new PerformanceObserver(l => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
  new PerformanceObserver(l => { const e = l.getEntries().pop(); window.__lcp = Math.round(e.startTime) }).observe({ type: 'largest-contentful-paint', buffered: true })
}

async function run(browser, name, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  await page.addInitScript(observe)
  const reqs = [], errors = []
  page.on('request', r => reqs.push(r.url()))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
  page.on('pageerror', e => errors.push(String(e).slice(0, 140)))
  await page.goto(`${BASE}/${name}.html`, { waitUntil: 'load' })
  await page.waitForTimeout(800)
  const engineEarly = reqs.some(u => u.includes('engine.js') || u.includes('/v1/embed.html'))
  const top = await page.evaluate(() => { const e = document.querySelector('tracking-globe,iframe'); return e ? e.getBoundingClientRect().top + scrollY : -1 })
  await page.evaluate(y => scrollTo(0, y - 40), top)
  await page.waitForTimeout(3000)
  const res = await page.evaluate(() => {
    const el = document.querySelector('tracking-globe'), fr = document.querySelector('iframe')
    return { cls: +window.__cls.toFixed(4), lcp: window.__lcp, long: window.__long, h: (el || fr)?.getBoundingClientRect().height, mounted: !!el?.shadowRoot?.querySelector('.w'), items: el?.shadowRoot?.querySelectorAll('.it').length ?? null, docW: document.documentElement.scrollWidth, winW: innerWidth }
  })
  let frameItems = null
  const f = page.frames().find(x => x.url().includes('/v1/embed.html'))
  if (f) { await page.waitForTimeout(1500); frameItems = await f.evaluate(() => document.querySelector('tracking-globe')?.shadowRoot?.querySelectorAll('.it').length ?? 0).catch(e => String(e)) }
  await page.screenshot({ path: path.join(OUT, `${name}-${ctxOpts.isMobile ? 'phone' : 'desktop'}.png`) })
  const others = [...new Set(reqs.map(u => new URL(u).host))].filter(h => !h.startsWith('localhost'))
  console.log(JSON.stringify({ name, device: ctxOpts.isMobile ? 'phone' : 'desktop', engineBeforeScroll: engineEarly, ...res, frameItems, thirdParty: others, errors }))
  await ctx.close()
}

;(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: false, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  for (const name of ['plain', 'wordpress-block', 'shopify-custom-liquid', 'sharepoint-embed', 'strict-csp']) {
    await run(browser, name, { viewport: { width: 1280, height: 800 } })
    await run(browser, name, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  }
  await browser.close()
})()
