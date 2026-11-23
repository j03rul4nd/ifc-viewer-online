// Debug helper: opens one harness page, runs the compare and prints what its viewers report.
//   PW=… node probe.mjs <scene>
const { chromium } = await import(process.env.PW || 'playwright-core')
const [scene = 'd5-compare'] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'msedge', args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1504, height: 780 } })
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('console:', m.text().slice(0, 200)) })
await page.goto(`http://127.0.0.1:8732/listing/v3/harness/out/${scene}.html`)
await page.waitForTimeout(4000)
await page.locator('[data-ifcvo-compare] button').filter({ hasText: /^Compare$/ }).first().click()
await page.waitForTimeout(90000)
console.log(await page.evaluate(async () => {
  const out = { n: window.__cmp.length, status: document.querySelector('.ifcvo-compare-status')?.textContent, notes: [...document.querySelectorAll('.ifcvo-compare-note')].map((n) => n.textContent) }
  try { const d = await window.__cmp[0].getProductData({ maxElements: 20000 }); out.keys = Object.keys(d || {}) } catch (e) { out.err = String(e) }
  out.stageH = getComputedStyle(document.querySelector('.ifcvo-compare-stage')).height
  return JSON.stringify(out)
}))
await browser.close()
