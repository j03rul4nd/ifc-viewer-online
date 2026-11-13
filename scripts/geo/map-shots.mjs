#!/usr/bin/env node
/**
 * Map 3D screenshots for visual review of roads and bridges.
 * `node scripts/geo/map-shots.mjs --url http://localhost:3391 --out <dir> --tag before
 *   [--detail simple,showcase] [--sites cat,ronda,bacroda,carmel,lujiazui,nanpu]`
 *
 * Headed Chrome 1600×900 DPR 1 (`ui=client`). For each detail level (simple =
 * City, showcase = Presentation) it opens the scene, enables the map, moves to
 * each site with the dev-only `__geoRelocate`, and saves one wide (≈180 m) and
 * one close (≈60 m) 45° view. Dev handles only exist in the dev build.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true])
  return acc
}, []))
const BASE = String(args.url ?? 'http://localhost:3391').replace(/\/$/, '')
const OUT = String(args.out ?? '.'); mkdirSync(OUT, { recursive: true })
const TAG = String(args.tag ?? 'shot')
const W = 1600, H = 900
const BCN = '/?model=/models/barcelona-catalunya/fonts-bessones.ifc&map=terrain,buildings&validate=0&ui=client'
const SHA = '/?model=/models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc&map=terrain,buildings&validate=0&ui=client'
// heading: horizontal direction camera→target, degrees from +x toward +z
const SITES = {
  cat: { scene: BCN, lat: 41.38740, lon: 2.16964, relocate: false, dists: [180, 60], heading: 233 },
  ronda: { scene: BCN, lat: 41.38360, lon: 2.14260, relocate: true, dists: [200, 70], heading: 200 }, // Ronda del Mig / Gran Via (trench)
  bacroda: { scene: BCN, lat: 41.41460, lon: 2.19320, relocate: true, dists: [220, 80], heading: 233 },
  carmel: { scene: BCN, lat: 41.41720, lon: 2.15560, relocate: true, dists: [180, 60], heading: 233 },
  lujiazui: { scene: SHA, lat: 31.23970, lon: 121.49980, relocate: false, dists: [300, 90], heading: 233 },
  nanpu: { scene: SHA, lat: 31.21700, lon: 121.49600, relocate: true, dists: [400, 120], heading: 200 },
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pick = (k, all) => (args[k] ? String(args[k]).split(',') : all)

async function waitReady(page, ms = 240_000) {
  const t0 = Date.now()
  for (;;) {
    const ok = await page.evaluate(() => {
      const s = globalThis.__geoStore?.getState()
      return !!s && s.buildingsStatus === 'ready' && s.terrainStatus === 'ready' && !!globalThis.__geoSystem
    }).catch(() => false)
    if (ok) return
    if (Date.now() - t0 > ms) { await page.screenshot({ path: join(OUT, "fail.png") }).catch(() => {}); throw new Error("map not ready " + JSON.stringify(await page.evaluate(() => { const s = globalThis.__geoStore?.getState(); return s && { b: s.buildingsStatus, t: s.terrainStatus, en: s.enabled } }).catch(() => null))) }
    await sleep(500)
  }
}

async function openScene(browser, scene, detail) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  await ctx.addInitScript((d) => { try { localStorage.setItem('ifc-geo-detail:v1', d) } catch {} }, detail)
  const page = await ctx.newPage()
  await page.goto(BASE + scene, { waitUntil: 'domcontentloaded', timeout: 240_000 })
  const consent = page.getByRole('button', { name: /enable map|activar mapa|activar el mapa/i })
  await consent.first().click({ timeout: 240_000 }).catch(() => {})
  await waitReady(page)
  console.log('detail', detail, '->', await page.evaluate(() => globalThis.__geoStore.getState().contextDetail))
  return { ctx, page }
}

async function shoot(page, site, name, detail) {
  if (site.relocate) {
    await page.evaluate(({ lat, lon }) => globalThis.__geoRelocate(lat, lon), site)
    await sleep(1500); await waitReady(page)
  }
  const s = await page.evaluate(({ lat, lon }) => {
    const geo = globalThis.__geoSystem
    const p = geo.sceneOfLatLon(lat, lon)
    return { x: p.x, z: p.z, g: geo.groundHeightAt(p.x, p.z) ?? p.y }
  }, site)
  const h = (site.heading * Math.PI) / 180
  for (const d of site.dists) {
    const k = d * Math.SQRT1_2
    const pos = { x: s.x - Math.cos(h) * k, y: s.g + k, z: s.z - Math.sin(h) * k }
    await page.evaluate(({ pos, t }) => globalThis.__ifcViewer.setCameraLookAt(pos, t, false), { pos, t: { x: s.x, y: s.g, z: s.z } })
    await page.bringToFront()
    await sleep(9000)
    const file = join(OUT, `${TAG}-${name}-${detail}-${d}m.png`)
    await page.screenshot({ path: file })
    console.log(file)
  }
}

const browser = await chromium.launch({ headless: false, channel: 'chrome', args: [`--window-size=${W + 16},${H + 140}`, '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] })
try {
  for (const detail of pick('detail', ['simple', 'showcase'])) {
    const names = pick('sites', Object.keys(SITES))
    for (const scene of [BCN, SHA]) {
      const here = names.filter((n) => SITES[n].scene === scene)
      if (!here.length) continue
      const { ctx, page } = await openScene(browser, scene, detail)
      for (const n of here) {
        try { await shoot(page, SITES[n], n, detail) } catch (e) { console.error(n, detail, e.message) }
      }
      await ctx.close()
    }
  }
} finally { await browser.close() }
