// ─── flood lab (development page: /flood-lab.html) ───────────────────────────
// Phase-1 harness, never shipped (nothing in the app imports it and the build
// only takes index.html): runs the parity suite and the benchmark, and plays
// the city demo through the real worker so the whole pipeline is exercised.
// window.__floodLab is what scripts/flood/gpu-suite.mjs drives.

import { cityDemo } from '../core/cases'
import { cellCount } from '../core/grid'
import type { FloodBackend, FloodStats } from '../core/solver-api'
import { detectFloodSupport, type BackendChoice } from '../gpu/create'
import { FloodRunner } from '../worker/runner'
import type { RunPerf } from '../worker/protocol'
import { runBench, type BenchOptions } from './bench'
import { runSuite } from './suite'
import { Preview2D } from './render2d'

const app = document.getElementById('app')!
app.innerHTML = `
<style>
  body { margin: 0; background: #0a0a0c; color: #e7e7ea; font: 13px/1.45 system-ui, sans-serif; }
  .wrap { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 16px; padding: 16px; }
  @media (max-width: 860px) { .wrap { grid-template-columns: 1fr; } }
  canvas { width: 100%; image-rendering: pixelated; background: #15161b; border-radius: 10px; }
  .card { background: rgba(22,24,30,.9); border: 1px solid #262833; border-radius: 10px; padding: 12px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 6px 0; }
  button, select { background: #1c1e26; color: inherit; border: 1px solid #30333f; border-radius: 7px; padding: 5px 9px; font: inherit; }
  button.primary { background: #5E6AD2; border-color: #5E6AD2; color: #fff; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 8px 0 0; font-variant-numeric: tabular-nums; }
  dt { color: #8b8d98; } dd { margin: 0; text-align: right; }
  pre { white-space: pre-wrap; font: 11px/1.4 ui-monospace, monospace; max-height: 50vh; overflow: auto; }
  .warn { color: #e5b567; font-size: 12px; }
  h1 { font-size: 14px; letter-spacing: .08em; text-transform: uppercase; color: #8b8d98; margin: 0 0 6px; }
</style>
<div class="wrap">
  <div>
    <canvas id="map"></canvas>
    <p class="warn">Simplified, indicative simulation — not a certified hydraulic study.</p>
  </div>
  <div>
    <div class="card">
      <h1>Flood lab · phase 1</h1>
      <div id="support" class="row"></div>
      <div class="row">
        <select id="backend"><option value="auto">auto</option><option value="webgpu">WebGPU</option><option value="webgl2">WebGL2</option></select>
        <select id="power"><option value="low-power">low-power GPU</option><option value="high-performance">high-performance GPU</option></select>
        <select id="size"><option>250</option><option selected>500</option><option>1000</option></select>
      </div>
      <div class="row">
        <button id="start" class="primary">Start demo</button>
        <button id="play">Pause</button>
        <select id="speed"><option value="60">60× real time</option><option value="300" selected>300×</option><option value="max">max</option></select>
        <select id="mode"><option value="now">depth now</option><option value="max">max depth</option></select>
      </div>
      <dl id="stats"></dl>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="row"><button id="suite">Run GPU ⇄ CPU suite</button><button id="bench">Run benchmark</button></div>
      <pre id="out"></pre>
    </div>
  </div>
</div>`

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const out = $<HTMLPreElement>('out')
const statsEl = $<HTMLDListElement>('stats')
let runner: FloodRunner | null = null
let preview: Preview2D | null = null
let lastFrame: Uint16Array | null = null
let running = false
let info = ''

const fmt = (x: number, d = 2): string => (Number.isFinite(x) ? x.toLocaleString('en', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–')

function showStats(s: FloodStats, p: RunPerf): void {
  const rows: Array<[string, string]> = [
    ['backend', info],
    ['simulated time', `${fmt(s.t / 60, 1)} min`],
    ['step', `${fmt(s.dt, 3)} s`],
    ['steps / s', fmt(p.stepsPerSecond, 0)],
    ['× real time', fmt(p.speedup, 0)],
    ['max depth', `${fmt(s.hMax, 2)} m`],
    ['max speed', `${fmt(s.vMax, 2)} m/s`],
    ['flooded area', `${fmt(s.floodedArea / 10_000, 2)} ha`],
    ['water on surface', `${fmt(s.volume, 0)} m³`],
    ['outflow', `${fmt(s.outflowVolume, 0)} m³`],
    ['mass balance error', s.massError.toExponential(2)],
  ]
  statsEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')
}

function startDemo(): void {
  runner?.dispose()
  const n = Number(($<HTMLSelectElement>('size')).value)
  const c = cityDemo(n, 2, 90, 45)
  preview = new Preview2D($<HTMLCanvasElement>('map'), {
    ...c.grid, z: c.grid.z.slice(), blocked: c.grid.blocked.slice(),
  })
  info = '…'
  runner = new FloodRunner({
    onReady: (r) => { info = `${r.backend} · ${r.device}${r.fallbackReason ? ` (fallback: ${r.fallbackReason})` : ''}` },
    onStats: showStats,
    onFrame: (f) => {
      lastFrame = f.data
      preview?.draw(f.data, ($<HTMLSelectElement>('mode')).value as 'now' | 'max')
    },
    onState: (s) => {
      running = s.running
      $('play').textContent = s.running ? 'Pause' : 'Play'
    },
    onError: (m) => { out.textContent = `Error: ${m}` },
  })
  runner.init({
    grid: c.grid, hyetograph: c.hyetograph, params: c.params, endS: c.durationS,
    backend: ($<HTMLSelectElement>('backend')).value as BackendChoice,
    powerPreference: ($<HTMLSelectElement>('power')).value as 'low-power' | 'high-performance',
  })
  const sp = ($<HTMLSelectElement>('speed')).value
  runner.play(sp === 'max' ? 'max' : Number(sp))
  out.textContent = `City demo ${n}×${n} (${cellCount(c.grid).toLocaleString('en')} cells, 2 m), ${c.hyetograph.intensityMmH[0]} mm/h for 45 min.`
}

$('start').onclick = startDemo
$('play').onclick = () => {
  if (!runner) return
  if (running) runner.pause()
  else {
    const sp = ($<HTMLSelectElement>('speed')).value
    runner.play(sp === 'max' ? 'max' : Number(sp))
  }
}
$('speed').onchange = () => {
  const sp = ($<HTMLSelectElement>('speed')).value
  if (running) runner?.play(sp === 'max' ? 'max' : Number(sp))
}
$('mode').onchange = () => { if (lastFrame) preview?.draw(lastFrame, ($<HTMLSelectElement>('mode')).value as 'now' | 'max') }

async function backendsAvailable(): Promise<FloodBackend[]> {
  const s = await detectFloodSupport()
  return [...(s.webgpu ? ['webgpu' as const] : []), ...(s.webgl2 ? ['webgl2' as const] : [])]
}

$('suite').onclick = async () => {
  out.textContent = 'Running suite…'
  const r = await runSuite(await backendsAvailable())
  out.textContent = JSON.stringify(r, null, 1)
}
$('bench').onclick = async () => {
  out.textContent = 'Benchmarking…'
  const r = await runBench({ backends: await backendsAvailable() })
  out.textContent = JSON.stringify(r, null, 1)
}

void detectFloodSupport().then((s) => {
  $('support').innerHTML = `WebGPU: <b>${s.webgpu ? 'yes' : 'no'}</b> · WebGL2 float: <b>${s.webgl2 ? 'yes' : 'no'}</b>`
})

/** Runs a small demo through the worker until it finishes: proves the worker path end to end. */
function workerSmoke(backend: BackendChoice = 'auto'): Promise<{ backend: string; device: string; fallback: string | null; t: number; massError: number; frames: number }> {
  return new Promise((resolve, reject) => {
    const c = cityDemo(160, 2, 90, 20)
    let ready = { backend: '', device: '', fallback: null as string | null }
    let frames = 0
    let last: FloodStats | null = null
    const r = new FloodRunner({
      onReady: (x) => { ready = { backend: x.backend, device: x.device, fallback: x.fallbackReason } },
      onStats: (s) => { last = s },
      onFrame: () => { frames++ },
      onError: (m) => { r.dispose(); reject(new Error(m)) },
      onState: (s) => {
        if (!s.running && s.finished) {
          r.dispose()
          resolve({ ...ready, t: last?.t ?? 0, massError: last?.massError ?? NaN, frames })
        }
      },
    })
    r.init({ grid: c.grid, hyetograph: c.hyetograph, params: c.params, endS: c.durationS, backend })
    r.play('max')
  })
}

declare global {
  interface Window {
    __floodLab: {
      support: typeof detectFloodSupport
      runSuite: (backends?: FloodBackend[]) => ReturnType<typeof runSuite>
      runBench: (o?: BenchOptions) => ReturnType<typeof runBench>
      startDemo: () => void
      workerSmoke: typeof workerSmoke
    }
  }
}

window.__floodLab = {
  support: detectFloodSupport,
  runSuite: async (b) => runSuite(b ?? (await backendsAvailable())),
  runBench: (o) => runBench(o),
  startDemo,
  workerSmoke,
}
