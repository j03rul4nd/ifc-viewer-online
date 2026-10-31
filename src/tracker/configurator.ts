// ─── Tracking globe configurator ─────────────────────────────────────────────
// Static page behaviour: form ⇄ config ⇄ live preview ⇄ per-platform snippets.
// The page generator (scripts/track/build-track-pages.mjs) owns the markup and
// the words; every field carries data-k="path.in.config".
import { encodeConfig, normalizeConfig, normalizeShipments, PALETTES, parseCsv, type Shipment, type TrackerConfig } from './config'

type El = HTMLElement & { update(c: unknown): void; toPNG(): string | undefined }
const STORE = 'tracking-globe:config'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

const DEMOS: Record<string, Partial<Shipment>[]> = {
  china: [
    { id: 'SHA-20418', label: 'Solar inverters', from: 'shanghai', to: 'rotterdam', mode: 'sea', status: 'transit', progress: .46 },
    { id: 'NGB-77120', label: 'Furniture', from: 'ningbo', to: 'valencia', mode: 'sea', status: 'delayed', progress: .62 },
    { id: 'HKG-3091', label: 'Electronics', from: 'hkg', to: 'fra', mode: 'air', status: 'transit', progress: .35 },
    { id: 'XIY-5526', label: 'Auto parts', from: 'xian', to: 'duisburg', mode: 'rail', status: 'transit', progress: .55 },
    { id: 'YTN-88213', label: 'Textiles', from: 'yantian', to: 'hamburg', mode: 'sea', status: 'delivered', progress: 1 },
  ],
  world: [
    { id: 'LAX-1102', label: 'Machinery', from: 'shanghai', to: 'losangeles', mode: 'sea', status: 'transit', progress: .4 },
    { id: 'SSZ-4410', label: 'Coffee', from: 'santos', to: 'rotterdam', mode: 'sea', status: 'transit', progress: .7 },
    { id: 'DXB-2207', label: 'Medical devices', from: 'lhr', to: { name: 'Dubai', lat: 25.25, lng: 55.36 } as never, mode: 'air', status: 'transit', progress: .5 },
    { id: 'SYD-6631', label: 'Wine', from: 'sydney', to: 'singapore', mode: 'sea', status: 'pending', progress: 0 },
    { id: 'LOS-9012', label: 'Generators', from: 'hamburg', to: 'lagos', mode: 'sea', status: 'delayed', progress: .58 },
  ],
}

const state: { cfg: Record<string, unknown>; source: string; demo: string; pasted: string; base: string; tab: string } = {
  cfg: {
    title: '', view: 'globe', height: 560, autoRotate: true, speed: 1,
    theme: { preset: 'dark', landStyle: 'dots', radius: 12, accent: '#5E6AD2' },
    controls: { drag: true, zoom: true, viewSwitch: true, list: true, search: true, legend: true, fullscreen: true },
  },
  source: 'demo', demo: 'china', pasted: '', base: `${location.origin}/track/v1/`, tab: 'html',
}
try { Object.assign(state, JSON.parse(localStorage.getItem(STORE) ?? '{}')) } catch { /* private mode */ }

const get = (path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], state.cfg)
function set(path: string, v: unknown): void {
  const ks = path.split('.'); let o = state.cfg as Record<string, unknown>
  for (const k of ks.slice(0, -1)) o = (o[k] ??= {}) as Record<string, unknown>
  o[ks[ks.length - 1]] = v
}

function parsePasted(text: string): Shipment[] {
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) { try { return normalizeShipments(JSON.parse(t)) } catch { return [] } }
  return parseCsv(t)
}
function buildConfig(): TrackerConfig {
  const raw: Record<string, unknown> = JSON.parse(JSON.stringify(state.cfg))
  raw.simulate = state.source === 'demo' || raw.simulate === true
  delete raw.feed; delete raw.lookup; delete raw.shipments
  if (state.source === 'demo') raw.shipments = DEMOS[state.demo]
  if (state.source === 'paste') raw.shipments = parsePasted(state.pasted)
  if (state.source === 'feed') { raw.feed = state.cfg.feed; raw.simulate = false }
  if (state.source !== 'demo' && state.cfg.lookup) raw.lookup = state.cfg.lookup
  return normalizeConfig(raw)
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
function outputs(cfg: TrackerConfig): Record<string, string> {
  const code = encodeConfig(cfg), base = state.base.replace(/\/?$/, '/')
  const el = `<tracking-globe config="${code}" style="display:block;height:${cfg.height}px"></tracking-globe>`
  const script = `<script src="${esc(base)}tracker.js" async></script>`
  const url = `${base}embed.html#c=${code}`
  const iframe = `<iframe src="${esc(url)}" title="${esc(cfg.title || 'Shipment tracking map')}" width="100%" height="${cfg.height}" style="border:0;display:block" loading="lazy" allow="fullscreen"></iframe>`
  const html = `${el}\n${script}`
  return {
    html, wordpress: html, wordpressShort: `[tracking_globe config="${code}" height="${cfg.height}"]`, wordpressFrame: iframe,
    shopify: html, shopifyConfig: code,
    sharepoint: url, sharepointFrame: iframe, sharepointDomain: new URL(base, location.href).hostname,
    link: url, linkFrame: iframe,
  }
}

const preview = $<El>('tg-preview')
let timer = 0
function apply(): void {
  clearTimeout(timer)
  timer = window.setTimeout(() => {
    const cfg = buildConfig(), out = outputs(cfg)
    preview.style.height = `${cfg.height}px`
    preview.update(cfg)
    document.querySelectorAll<HTMLElement>('[data-out]').forEach(n => { n.textContent = out[n.dataset.out!] ?? '' })
    const size = encodeConfig(cfg).length
    $('warn-size').hidden = size < 6000
    $('warn-public').hidden = state.source !== 'paste'
    $('warn-feed').hidden = state.source !== 'feed'
    $('warn-empty').hidden = !(state.source === 'paste' && state.pasted.trim() && !cfg.shipments.length)
    $('count').textContent = state.source === 'paste' ? String(cfg.shipments.length) : ''
    document.querySelectorAll<HTMLElement>('[data-when-source]').forEach(n => { n.hidden = !n.dataset.whenSource!.split(' ').includes(state.source) })
    try { localStorage.setItem(STORE, JSON.stringify(state)) } catch { /* private mode */ }
  }, 120)
}

document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach(field => {
  const k = field.dataset.k!, input = field as HTMLInputElement, v = get(k)
  if (input.type === 'checkbox') input.checked = v !== false
  else if (v !== undefined) field.value = String(v)
  field.addEventListener('input', () => {
    const val = input.type === 'checkbox' ? input.checked : input.type === 'range' || input.type === 'number' ? Number(field.value) : field.value
    set(k, val === '' ? undefined : val)
    apply()
  })
})
for (const [id, key] of [['source', 'source'], ['demo', 'demo'], ['pasted', 'pasted'], ['base', 'base']] as const) {
  const f = $<HTMLInputElement>(id); f.value = state[key]
  f.addEventListener('input', () => { state[key] = f.value; apply() })
}
// A colour input cannot be empty: show the theme's colour until the user picks one,
// and a new theme starts from its own colours rather than keeping the old theme's.
function seedColors(): void {
  const pal = PALETTES[get('theme.preset') === 'light' ? 'light' : 'dark']
  for (const [k, d] of [['background', pal.bg], ['ocean', pal.ocean], ['land', pal.land]]) {
    document.querySelector<HTMLInputElement>(`[data-k="theme.${k}"]`)!.value = String(get(`theme.${k}`) ?? d)
  }
}
seedColors()
document.querySelector('[data-k="theme.preset"]')!.addEventListener('input', () => {
  for (const k of ['background', 'ocean', 'land']) set(`theme.${k}`, undefined)
  seedColors(); apply()
})

// Tabs, as a real tablist
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role=tab]')]
function showTab(name: string): void {
  state.tab = name
  for (const t of tabs) { const on = t.dataset.tab === name; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; $(`p-${t.dataset.tab}`).hidden = !on }
}
tabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.dataset.tab!))
  t.addEventListener('keydown', e => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; showTab(n.dataset.tab!); n.focus() }
  })
})
showTab(state.tab)

document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach(b => {
  const label = b.textContent
  b.addEventListener('click', async () => {
    const text = document.querySelector<HTMLElement>(`[data-out="${b.dataset.copy}"]`)?.textContent ?? ''
    try { await navigator.clipboard.writeText(text) } catch {
      const r = document.createRange(); r.selectNodeContents(document.querySelector(`[data-out="${b.dataset.copy}"]`)!); getSelection()?.removeAllRanges(); getSelection()?.addRange(r); document.execCommand('copy')
    }
    b.textContent = b.dataset.done ?? '✓'; setTimeout(() => { b.textContent = label }, 1500)
  })
})
$('png').addEventListener('click', () => {
  const data = preview.toPNG(); if (!data) return
  const a = document.createElement('a'); a.href = data; a.download = 'shipment-tracking-map.png'; a.click()
})
$('reset').addEventListener('click', () => { try { localStorage.removeItem(STORE) } catch { /* private mode */ } location.reload() })
apply()
