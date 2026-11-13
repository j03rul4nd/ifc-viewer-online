#!/usr/bin/env node
/**
 * WP2 relief measures (dev build, headed Chrome):
 *   node scripts/geo/relief-measure.mjs --url http://localhost:3371 --site catalunya|carmel|vela --out file.json
 * Per site: model bounds and transform, anchor elevation, a 64×64 grid of the
 * patch's effective ground over `measuredBox` (to diff two builds: the graded
 * streets live there), and, where the flat map is displaced, the step between
 * the patch and the tiles at 200 points of the hole's edge and the height of
 * the tiles at Montjuïc (41.3636, 2.1586) in metres above sea level.
 */
import { chromium } from 'playwright-core'
import { writeFileSync } from 'node:fs'
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, all) => { if (x.startsWith('--')) a.push([x.slice(2), all[i + 1]]); return a }, []))
const MODELS = {
  catalunya: '/models/barcelona-catalunya/fonts-bessones.ifc',
  carmel: '/models/barcelona-catalunya/fonts-bessones.ifc',
  vela: '/models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc',
}
const site = args.site ?? 'catalunya'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const b = await chromium.launch({ headless: false, channel: 'chrome', args: ['--window-size=1616,1040', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
const p = await b.newPage({ viewport: { width: 1600, height: 900 } })
p.on('console', (m) => { if (/WP2|coarse|ICGC|dem/i.test(m.text())) console.log('[page]', m.text().slice(0, 200)) })
await p.goto(`${args.url}/?model=${MODELS[site]}&map=terrain,buildings&validate=0&ui=client`, { waitUntil: 'domcontentloaded', timeout: 300000 })
await p.getByRole('button', { name: /^(Activar mapa|Enable map)$/ }).first().click({ timeout: 240000 })
const ready = async () => {
  const st = () => p.evaluate(() => { const s = globalThis.__geoStore?.getState(); return s ? [s.terrainStatus, s.buildingsStatus] : [] }).catch(() => [])
  for (let i = 0; i < 600; i++) { if ((await st())[0] === 'ready') break; await sleep(500) }
  // Buildings (and with them the graded streets) are waited for, but an Overpass outage is recorded, not fatal.
  for (let i = 0; i < 600; i++) { const s = await st(); if (s[0] === 'ready' && s[1] !== 'loading' && s[1] !== 'idle') return s; await sleep(500) }
  return st()
}
const status0 = await ready()
if (site === 'carmel') { await p.evaluate(() => globalThis.__geoRelocate(41.4172, 2.1556)); await sleep(3000); await ready() }
await sleep(6000)
// The wide view, so tiles all round the hole are loaded.
await p.evaluate(() => {
  const g = globalThis.__geoSystem, a = globalThis.__geoStore.getState().placement, s = g.sceneOfLatLon(a.lat, a.lon)
  globalThis.__ifcViewer.setCameraLookAt([s.x + 900, s.y + 900, s.z + 1200], [s.x, s.y, s.z], false)
})
await sleep(15000)
const statusFinal = await ready()
const out = await p.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js')
  const v = globalThis.__ifcViewer, g = globalThis.__geoSystem, t = globalThis.__geoTerrain()
  const tiles = globalThis.__basemapTiles
  const bnd = v.getModelBounds?.()
  const res = {
    anchor: (({ lat, lon }) => ({ lat, lon }))(globalThis.__geoStore.getState().placement), anchorElevation: t.anchorElevation, rimDatumM: t.rimDatumM, coarse: !!t.coarse,
    coarseRange: t.coarse ? [t.coarse.minM, t.coarse.maxM] : null,
    modelBounds: bnd ? JSON.parse(JSON.stringify(bnd)) : null,
    modelTransform: v.getModelTransform?.() ?? null,
    tileGroup: { z: tiles.group.position.z, sz: tiles.group.scale.z },
  }
  const mb = t.measuredBox, N = 64, grid = []
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid.push(t.sampleGroundM(mb.minNx + (mb.maxNx - mb.minNx) * (i + 0.5) / N, mb.minNy + (mb.maxNy - mb.minNy) * (j + 0.5) / N))
  res.groundGrid = grid
  const y0 = g.sceneYOfElevation(0), y100 = g.sceneYOfElevation(100)
  const asl = (y) => (y - y0) * 100 / (y100 - y0)
  const vis = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true }
  const ray = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  function hitY(root, x, z, finest) {
    const meshes = []; root.traverse((o) => { if (o.isMesh) meshes.push(o) })
    // Not intersectObject(root): the tiles group answers raycasts itself (and not for these).
    // Both ways: a tile plane may face down in the world after its frame's rotation.
    ray.far = 2e5
    ray.set(new THREE.Vector3(x, 1e5, z), down)
    // The tile meshes' own raycast is switched off by the library: call three's.
    const cast = () => { const o = []; for (const m of meshes) THREE.Mesh.prototype.raycast.call(m, ray, o); return o }
    let hits = cast()
    ray.set(new THREE.Vector3(x, -1e5, z), new THREE.Vector3(0, 1, 0))
    hits = hits.concat(cast()).filter((h) => vis(h.object))
    if (!hits.length) return null
    if (!finest) return hits[0].point.y
    hits.sort((a, b) => (a.object.geometry.parameters?.width ?? 1) - (b.object.geometry.parameters?.width ?? 1))
    return hits[0].point.y
  }
  t.group.updateMatrixWorld(true)
  // Montjuïc: the tiles at the summit, in metres above sea level.
  for (const [key, lat, lon] of [['montjuic', 41.3636, 2.1586], ['montjuicCastle', 41.3634, 2.1660]]) {
  const mj = g.sceneOfLatLon(lat, lon)
  if (mj) {
    const ty = hitY(tiles.group, mj.x, mj.z, true)
    res[key] = { tileAslM: ty === null ? null : asl(ty), groundAtWorldAslM: asl(mj.y), sampleGroundM: (() => { const l = t.group.parent.worldToLocal(mj.clone()); return t.sampleGroundM(l.x, l.y) })() }
  }
  }
  // The hole (geo-system computeHolePlanes): the 3×3 tiles' half-side × (1 − 0.12), normalized.
  const n = 2 ** t.zoom, cnx = (t.centerTx + 0.5) / n - 0.5, cny = 0.5 - (t.centerTy + 0.5) / n, half = 1.5 / n * 0.88
  const frame = t.group.parent
  frame.updateMatrixWorld(true)
  const W = (nx, ny) => frame.localToWorld(new THREE.Vector3(nx, ny, 0))
  const c0 = W(cnx - half, cny - half), c1 = W(cnx + half, cny + half)
  const cx = (c0.x + c1.x) / 2, cz = (c0.z + c1.z) / 2, hx = Math.abs(c1.x - c0.x) / 2, hz = Math.abs(c1.z - c0.z) / 2
  res.groundUnderModelY = g.groundHeightAt(0, 0)
  const steps = []
  for (let k = 0; k < 200; k++) {
    const s = (k + 0.5) / 50, side = Math.floor(s), f = s - side
    const [x, z] = side === 0 ? [cx - hx + 2 * hx * f, cz - hz] : side === 1 ? [cx + hx, cz - hz + 2 * hz * f] : side === 2 ? [cx + hx - 2 * hx * f, cz + hz] : [cx - hx, cz + hz - 2 * hz * f]
    const a = hitY(t.group, x, z, false), m = hitY(tiles.group, x, z, true)
    steps.push(a === null || m === null ? null : (m - a))
  }
  res.holeHalfWorld = [hx, hz]
  const ok = steps.filter((s) => s !== null).map((s) => s * 100 / (y100 - y0))
  const abs = ok.map(Math.abs).sort((a, b) => a - b)
  res.step = { n: ok.length, maxAbsM: abs.at(-1), p95M: abs[Math.floor(abs.length * 0.95)], medianM: abs[abs.length >> 1], meanSignedM: ok.reduce((a, b) => a + b, 0) / ok.length }
  return res
})
out.status = statusFinal
writeFileSync(args.out, JSON.stringify(out, null, 1))
const { groundGrid, ...brief } = out
console.log(JSON.stringify(brief, null, 1))
await b.close()
