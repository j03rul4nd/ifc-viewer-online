// T-407 verifier E2E: CHROME=<chrome> node scripts/e2e/asbuilt-flow.mjs <outDir>
import { chromium } from 'playwright-core'
import fs from 'node:fs'
const SP = process.argv[2]
const URL0 = 'http://localhost:5199/?lang=en&model=/models/cras/model.ifc&scan=/models/cras/pointcloud-deviation-web.ply'
const b = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const errs = []
async function open(q) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  p.on('console', m => { if (m.type()==='error') errs.push(q+': '+m.text().slice(0,200)) }); p.on('pageerror', e => errs.push(q+' PE '+e.message))
  await p.goto(URL0 + q, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await p.getByRole('button', { name: 'Point cloud' }).first().waitFor({ timeout: 180000 })
  await p.waitForTimeout(60000)
  await p.getByRole('button', { name: 'Point cloud' }).first().click()
  await p.waitForTimeout(5000)
  await p.getByText('Analyze', { exact: true }).first().click(); await p.waitForTimeout(3000)
  return p
}
const shot = (p, n) => p.screenshot({ path: `${SP}/asbuilt-${n}.png` })
// no flag
let p


// flag
p = await open('&asbuilt=1')
const sec = p.locator('[data-testid="asbuilt-section"]')
console.log('FLAG section count', await sec.count(), 'text:', (await sec.innerText().catch(()=>'')).slice(0,120).replace(/\n/g,' | '))
await sec.scrollIntoViewIfNeeded().catch(()=>{})
if (!(await p.locator('[data-testid="asbuilt-panel"]').isVisible())) await sec.getByText('Compare with model').first().click()
await p.locator('[data-testid="asbuilt-panel"]').waitFor({ timeout: 30000 })
await shot(p, '02-panel')
console.log('block before pairs:', await p.locator('[data-testid="asbuilt-block"]').innerText().catch(()=>'-'), 'run disabled', await p.locator('[data-testid="asbuilt-run"]').isDisabled())
const canvas = await p.locator('canvas').first().boundingBox(); console.log('canvas', JSON.stringify(canvas))
await p.locator('[data-testid="asbuilt-pick"]').click()
await p.waitForTimeout(1500); await shot(p,'02b-afterpick'); console.log('picktext', await p.locator('[data-testid="asbuilt-pick"]').innerText().catch(e=>'GONE'))
const pts = JSON.parse(process.env.PTS ?? '[[862,245],[868,330],[625,343],[992,300],[855,290]]')
for (const [x, y] of pts) {
  await p.mouse.click(x, y); await p.waitForTimeout(1200)
  let done = false
  for (const [dx, dy] of [[0,0],[2,0],[-2,0],[0,2],[0,-2],[4,4],[-4,-4],[4,-4],[-4,4],[6,0],[-6,0],[0,6],[0,-6]]) {
    await p.mouse.click(x+dx, y+dy); await p.waitForTimeout(1000)
    const ph = await p.locator('[data-testid="asbuilt-panel"]').innerText()
    if (!/same corner on the scan/i.test(ph)) { done = true; break }
  }
  console.log("pair", x, y, done, (await p.locator('[data-testid="asbuilt-panel"] li').allInnerTexts()).join(" ; ").replace(/\s+/g," "))
}
await shot(p, '03-pairs')
console.log('panel:', (await p.locator('[data-testid="asbuilt-panel"]').innerText()).replace(/\n/g,' | ').slice(0,700))
if (await p.locator('[data-testid="asbuilt-pick"]').innerText().then(t=>/stop/i.test(t)).catch(()=>false)) await p.locator('[data-testid="asbuilt-pick"]').click()
if (await p.locator('[data-testid="asbuilt-apply"]').count()) { await p.locator('[data-testid="asbuilt-apply"]').click(); await p.waitForTimeout(3000); await shot(p, '04-applied') }
await shot(p,"04b-gate-blocked"); await p.locator('[data-testid="asbuilt-panel"] input[type=number]').first().fill("100"); await p.waitForTimeout(800)
const run = p.locator('[data-testid="asbuilt-run"]')
console.log('run disabled', await run.isDisabled(), 'block', await p.locator('[data-testid="asbuilt-block"]').innerText().catch(()=>'-'))
if (!(await run.isDisabled())) {
  await run.click(); await p.waitForTimeout(1500)
  const canCancel = await p.locator('[data-testid="asbuilt-cancel"]').count(); console.log('cancel visible', canCancel)
  if (canCancel) { await p.locator('[data-testid="asbuilt-cancel"]').click(); await p.waitForTimeout(2000); console.log('after cancel run enabled', !(await run.isDisabled().catch(()=>true))); await shot(p,'05-cancelled'); await run.click() }
  await p.locator('[data-testid="asbuilt-results"]').waitFor({ timeout: 400000 })
  await p.waitForTimeout(2000)
  await shot(p, '06-results')
  const rows = await p.locator('[data-testid="asbuilt-row"]').evaluateAll(rs => rs.map(r => r.dataset.state))
  const c = {}; rows.forEach(s => c[s]=(c[s]||0)+1); console.log('rows', rows.length, JSON.stringify(c))
  console.log('results:', (await p.locator('[data-testid="asbuilt-results"]').innerText()).replace(/\n/g,' | ').slice(0,500))
  await p.locator('[data-testid="asbuilt-colour"]').click(); await p.waitForTimeout(2000); await shot(p, '07-colour')
  await p.locator('[data-testid="asbuilt-isolate"]').click(); await p.waitForTimeout(2000); await shot(p, '08-isolate')
  await p.locator('[data-testid="asbuilt-clear"]').click(); await p.waitForTimeout(2000); await shot(p, '09-clear')
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), p.locator('[data-testid="asbuilt-csv"]').click()])
  await dl.saveAs(`${SP}/asbuilt-results.csv`)
  const csv = fs.readFileSync(`${SP}/asbuilt-results.csv`, 'utf8').trim().split(/\r?\n/)
  console.log('csv lines', csv.length, 'header', csv[0]); console.log(csv.slice(1,4).join('\n'))
}
console.log('ERRS', JSON.stringify(errs.slice(0,10)))
await b.close()
