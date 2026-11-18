import { chromium } from 'playwright-core'
const SP = process.argv[2]; const Q = process.argv[3] ?? '?asbuilt=1'
const b = await chromium.launch({ executablePath: process.env.CHROME, headless: true, args: ['--ignore-gpu-blocklist','--use-angle=swiftshader','--enable-unsafe-swiftshader'] })
const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
const errs = []; p.on('console', m => { if (m.type()==='error') errs.push(m.text()) }); p.on('pageerror', e => errs.push('PE '+e.message))
await p.goto('http://localhost:5199/' + Q + '&model=/models/cras/model.ifc&scan=/models/cras/pointcloud-deviation-web.ply', { waitUntil: 'domcontentloaded', timeout: 120000 })
await p.waitForTimeout(90000)
console.log(await p.evaluate(() => [...document.querySelectorAll('[data-testid]')].map(x => x.dataset.testid).filter(t=>/pc|asbuilt|cloud/i.test(t)).join(' ')))
console.log(await p.evaluate(() => [...document.querySelectorAll('button[title],button[aria-label]')].map(x => (x.getAttribute('aria-label')||x.title).slice(0,25)).filter(Boolean).join(' ; ').slice(0,900)))
await p.screenshot({ path: SP + '/asbuilt-00-probe.png' })
console.log('errs', errs.slice(0,5))
await b.close()
