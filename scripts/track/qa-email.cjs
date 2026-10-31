// Drives the email kit against a static server of public/: node scripts/track/qa-email.cjs http://localhost:PORT
const { chromium } = require('playwright-core')
const { encode } = { encode: o => Buffer.from(JSON.stringify(o)).toString('base64url') }
const base = process.argv[2]
const out = process.argv[3] || '.'
let fails = 0
const ok = (name, v) => { console.log(`${v ? 'ok  ' : 'FAIL'} ${name}`); if (!v) fails++ }
const brand = encode({
  title: 'Acme Logistics', theme: { preset: 'light', accent: '#e4002b', radius: 8 }, lookup: `${base}/__lookup/{id}`,
  page: {
    tagline: 'From factory to your door', ctaLabel: 'Shop again', ctaUrl: 'https://shop.example/?o={id}', campaign: 'q4', promoCode: 'THANKS10', promoLabel: '10% off', reviewUrl: 'https://shop.example/review',
    products: 'Kit | 9 € | | https://shop.example/kit', supportEmail: 'help@shop.example', beacon: `${base}/__beacon`,
    messages: { delayed: { headline: 'Sorry for the delay', body: 'Here is 10% off.', ctaLabel: 'Use it', ctaUrl: 'https://shop.example/sorry' } },
  },
})
;(async () => {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, locale: 'en-US' })
  const page = await ctx.newPage()
  const errors = [], beacons = [], outside = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('request', r => { const h = new URL(r.url()); if (r.url().includes('/__beacon')) beacons.push(r.postData()); if (!r.url().startsWith(base) && h.protocol.startsWith('http')) outside.push(r.url()) })
  await page.route('**/__beacon', r => r.fulfill({ status: 204 }))
  await page.route('**/__lookup/*', r => r.request().url().endsWith('LIVE') ? r.fulfill({ json: { id: 'LIVE', from: 'hkg', to: 'fra', mode: 'air', status: 'delivered', events: [{ at: '2026-10-30', label: 'Arrived', place: 'Frankfurt' }] }, headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } }))
  const open = async hash => { await page.goto('about:blank'); await page.goto(`${base}/track/v1/p.html#${hash}`); await page.waitForSelector('footer') }

  await open(`b=${brand}&id=SHA-1&from=shanghai&to=rotterdam&mode=sea&status=delayed&etd=2026-10-01&eta=2026-12-01&utm_source=mailchimp`)
  ok('delayed message replaces the headline', await page.textContent('h1') === 'Sorry for the delay')
  const cta = await page.getAttribute('.card .btn', 'href')
  ok('status CTA carries campaign tags', cta.includes('shop.example/sorry') && cta.includes('utm_source=mailchimp') && cta.includes('utm_campaign=q4'))
  ok('review hidden until delivered', !(await page.$('.stars')))
  ok('destination hosts are shown', (await page.textContent('footer')).includes('shop.example'))
  ok('promo shown', (await page.textContent('.promo code')) === 'THANKS10')
  await page.waitForFunction(() => document.querySelector('tracking-globe')?.shadowRoot?.querySelector('canvas'), null, { timeout: 15000 })
  await page.waitForTimeout(1200)
  ok('view event reached the beacon', beacons.some(b => b && b.includes('"view"')))
  ok('no horizontal scroll at phone width', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await page.screenshot({ path: `${out}/page-delayed.png`, fullPage: true })

  await open(`b=${brand}&id=LIVE&from=shanghai&to=rotterdam&status=transit`)
  await page.waitForSelector('.tl')
  ok('lookup wins over the link', (await page.textContent('.meta b')) === 'LIVE' && !!(await page.$('.stars')))
  await open(`b=${brand}&id=GONE&from=shanghai&to=rotterdam&status=transit`)
  ok('failed lookup falls back and says so', (await page.textContent('.card')).includes('Could not refresh'))
  await open(`b=${brand}&id=*|TRACK_ID|*`)
  ok('unfilled tag asks for a reference', !!(await page.$('.find')))
  await open(`b=${encode({ title: '<img src=x onerror=alert(1)>', page: { ctaLabel: 'X', ctaUrl: 'javascript:alert(1)' } })}&id=<b>A</b>&from=shanghai&to=rotterdam`)
  ok('markup in a link stays text', !(await page.$('h1 b, header img')) && !(await page.$('a[href^="javascript"]')) && (await page.textContent('.meta b')) === '<b>A</b>')

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${base}/tracking-globe/`)
  await page.click('[data-tab=email]')
  await page.waitForFunction(() => document.querySelector('#tg-preview')?.shadowRoot?.querySelector('canvas'), null, { timeout: 15000 })
  await page.selectOption('#esp', 'hubspot'); await page.waitForTimeout(300)
  const pre = await page.textContent('[data-out=emailLink]')
  ok('link has HubSpot tags', pre.includes('{{ contact.track_id }}'))
  ok('sample link set', (await page.getAttribute('#email-test', 'href')).includes('sample=1'))
  const html = await page.textContent('[data-out=emailHtml]')
  await page.setContent(html.replace(/https:\/\/YOUR-SITE[^"]+/g, 'data:,')); await page.screenshot({ path: `${out}/email-block.png` })
  await page.goto(`${base}/tracking-globe/`); await page.click('[data-tab=email]')
  await page.waitForFunction(() => document.querySelector('#tg-preview')?.shadowRoot?.querySelector('canvas'), null, { timeout: 15000 }); await page.waitForTimeout(800)
  const files = []
  page.on('download', d => files.push(d))
  await page.click('#dl-images'); await page.waitForTimeout(2500)
  ok('four status images', files.length === 4 && files.some(f => f.suggestedFilename() === 'tracking-delayed.png'))
  if (files[2]) await files[2].saveAs(`${out}/tracking-delayed.png`)
  files.length = 0
  await page.click('#dl-gif'); await page.waitForFunction(() => document.getElementById('gif-size').textContent, null, { timeout: 90000 })
  await page.waitForTimeout(300)
  ok('gif downloaded', files[0]?.suggestedFilename() === 'tracking-globe.gif')
  if (files[0]) await files[0].saveAs(`${out}/tracking-globe.gif`)
  console.log('gif', await page.textContent('#gif-size'))
  ok('no page errors', errors.length === 0); if (errors.length) console.log(errors)
  ok('only the hosts the brand set were called', outside.every(u => u.includes('shop.example') || u.includes('data:'))); if (outside.length) console.log(outside)
  await browser.close()
  console.log(fails ? `${fails} failed` : 'all passed')
  process.exit(fails ? 1 : 0)
})()
