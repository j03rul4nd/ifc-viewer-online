// ─── flood GPU suite ──────────────────────────────────────────────────────────
// vitest runs in Node/jsdom, which has no GPU. This drives the flood lab page
// (flood-lab.html, dev only) in a real Chrome: the GPU ⇄ CPU parity suite on
// every backend the browser offers, and optionally the benchmark.
//
//   npm run test:flood-gpu                      parity suite (exit 1 on failure)
//   npm run test:flood-gpu -- --bench           + benchmark 250² / 500² / 1000²
//   options: --sizes 250,500 --seconds 4 --backends webgpu,webgl2
//            --powers low-power,high-performance --no-suite --headed
//            --url http://localhost:3000/
//            --chrome "C:/path/chrome.exe"  (or CHROME_PATH)
//
// Without --url it starts its own Vite dev server on a free port.

import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(`--${name}`)
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}

const CHROMES = [
  process.env.CHROME_PATH,
  opt('chrome'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean)

const executablePath = CHROMES.find((p) => existsSync(p))
if (!executablePath) {
  console.error('No Chrome found: pass --chrome <path> or set CHROME_PATH.')
  process.exit(2)
}

let server = null
let url = opt('url')
if (!url) {
  const { createServer } = await import('vite')
  server = await createServer({ configFile: 'vite.config.ts', server: { port: 0, strictPort: false }, logLevel: 'error' })
  await server.listen()
  url = server.resolvedUrls.local[0]
}
const page_url = new URL('flood-lab.html', url).href

const headed = flag('headed')
const browser = await chromium.launch({
  executablePath,
  // Chrome's current headless mode is the real browser without a window: it
  // keeps the GPU (WebGPU / WebGL2 on the actual adapter).
  headless: false,
  args: [
    ...(headed ? [] : ['--headless=new']),
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
})

let failed = false
try {
  const page = await browser.newPage()
  page.on('pageerror', (e) => console.error('[page error]', e.message))
  page.on('console', (m) => { if (m.text().startsWith('[bench]')) console.log('  ' + m.text()) })
  await page.goto(page_url)
  await page.waitForFunction(() => !!window.__floodLab, null, { timeout: 120_000 })
  const support = await page.evaluate(() => window.__floodLab.support())
  console.log(`Chrome: ${await browser.version()} · WebGPU: ${support.webgpu} · WebGL2 float: ${support.webgl2}`)
  if (!support.supported) throw new Error('No GPU backend available in this browser')

  const suite = flag('no-suite') ? [] : await page.evaluate(() => window.__floodLab.runSuite())
  console.log('\nGPU ⇄ CPU parity')
  for (const r of suite) {
    const m = r.metrics
    const fmt = (x) => (x === undefined ? '-' : Number(x).toExponential(2))
    console.log(
      `  ${r.pass ? 'PASS' : 'FAIL'}  ${r.case.padEnd(14)} ${r.backend.padEnd(7)} steps ${String(m.stepsGpu ?? '-').padStart(5)}/${String(m.stepsCpu ?? '-').padEnd(5)} ` +
      `rel L1 ${fmt(m.relL1)}  max|Δh| ${fmt(m.maxAbsDh)}  mass ${fmt(m.massErrorGpu)}  ${r.ms} ms`,
    )
    for (const f of r.failures) console.log(`        ↳ ${f}`)
    if (!r.pass) failed = true
  }

  // The app runs the solver in a worker: check it gets a GPU backend there too.
  for (const backend of ['auto', 'webgl2']) {
    const w = await page.evaluate((b) => window.__floodLab.workerSmoke(b), backend)
    const ok = w.t > 0 && Math.abs(w.massError) < 1e-4 && w.frames > 0
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  worker (${backend}) → ${w.backend} · ${w.device} · ran to ${w.t} s, mass ${Number(w.massError).toExponential(2)}, ${w.frames} frames${w.fallback ? ` (fallback: ${w.fallback})` : ''}`)
    if (!ok) failed = true
  }

  if (flag('bench')) {
    const sizes = opt('sizes', '250,500,1000').split(',').map(Number)
    const seconds = Number(opt('seconds', '4'))
    const backends = opt('backends', [support.webgpu && 'webgpu', support.webgl2 && 'webgl2'].filter(Boolean).join(',')).split(',')
    const powers = opt('powers', 'low-power,high-performance').split(',')
    const rows = await page.evaluate((o) => window.__floodLab.runBench(o), { sizes, seconds, backends, powers })
    console.log('\nBenchmark (city demo, 2 m cells, 90 mm/h storm)')
    console.log('  backend  power             cells      steps/s  ms/step  ×real time  mean dt  device')
    for (const r of rows) {
      console.log(
        `  ${r.backend.padEnd(8)} ${r.power.padEnd(17)} ${`${r.n}²`.padEnd(10)} ${Math.round(r.stepsPerSecond).toString().padStart(7)}  ` +
        `${r.msPerStep.toFixed(3).padStart(7)}  ${Math.round(r.speedup).toString().padStart(10)}  ${r.meanDtS.toFixed(3).padStart(6)} s  ${r.device}`,
      )
    }
  }
} catch (err) {
  console.error(err)
  failed = true
} finally {
  await browser.close()
  await server?.close()
}
process.exit(failed ? 1 : 0)
