// ─── Tracking globe configurator ─────────────────────────────────────────────
// Static page behaviour: form ⇄ config ⇄ live preview ⇄ per-platform snippets.
// The page generator (scripts/track/build-track-pages.mjs) owns the markup and
// the words; every field carries data-k="path.in.config".
import { encodeConfig, encodeRaw, compactConfig, normalizeConfig, normalizeShipments, PALETTES, parseCsv, type Shipment, type Status, type TrackerConfig } from './config'
import { DEFAULT_FIELDS, emailHtml, LINK_FIELDS, trackingLink, type Esp, type FieldNames } from './email'
import { encodeGif } from './gif'
import { pickLang, words } from './i18n'
import { normalizePage } from './page-config'
import { pageWords } from './page-i18n'

type El = HTMLElement & { update(c: unknown): void; toPNG(): string | undefined; rotate(d: number): void; setView(v: string): void }
const STORE = 'tracking-globe:config'
declare const __SUBSCRIBE_URL__: string

// Pro is not on sale: only the team opens this, with the app's own preview gate.
// A static page cannot enforce a plan; this is a storefront lock, not protection.
function proUnlocked(): boolean {
  const param = new URLSearchParams(location.search).get('preview')
  try {
    if (param === 'pricing') sessionStorage.setItem('ifc:preview-pricing', '1')
    else if (param === 'off') sessionStorage.removeItem('ifc:preview-pricing')
    return sessionStorage.getItem('ifc:preview-pricing') === '1'
  } catch { return param === 'pricing' }
}
const PRO = proUnlocked()
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

const state: { cfg: Record<string, unknown>; source: string; demo: string; pasted: string; base: string; tab: string; esp: string; linkData: string; linkStyle: string; kit: string; imageBase: string; fields: FieldNames } = {
  cfg: {
    title: '', view: 'globe', height: 560, autoRotate: true, speed: 1,
    theme: { preset: 'dark', landStyle: 'dots', radius: 12, accent: '#5E6AD2' },
    controls: { drag: true, zoom: true, viewSwitch: true, list: true, search: true, legend: true, fullscreen: true },
  },
  source: 'demo', demo: 'china', pasted: '', base: `${location.origin}/track/v1/`, tab: 'html', esp: 'mailchimp', linkData: 'fields', linkStyle: 'hash', kit: '', imageBase: '', fields: { ...DEFAULT_FIELDS },
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
    link: url, linkFrame: iframe, ...emailOutputs(cfg, base),
  }
}

/** Everything the tracking page needs, minus the data: shipments belong to each recipient. */
function brandKit(cfg: TrackerConfig): Record<string, unknown> {
  const { shipments: _s, simulate: _m, feed: _f, ...rest } = compactConfig(cfg)
  return { ...rest, lookup: state.linkData === 'lookup' ? get('lookup') : undefined, page: normalizePage(get('page')) }
}
function emailOutputs(cfg: TrackerConfig, base: string): Record<string, string> {
  if (!PRO) return {}
  const kit = brandKit(cfg), brand = encodeRaw(kit), esp = state.esp as Esp, lang = pickLang(cfg.lang), w = pageWords(lang), t = words(lang)
  const lookup = state.linkData === 'lookup'
  const link = trackingLink({ base, brand, kit: state.kit.trim() || undefined, esp, fields: state.fields, lookup, query: state.linkStyle === 'query', campaign: normalizePage(get('page')).campaign })
  const now = Date.now(), day = 86400000, iso = (n: number) => new Date(now + n * day).toISOString().slice(0, 10)
  const sample = new URLSearchParams({ b: brand, sample: '1', id: 'SHA-20418', from: 'shanghai', to: 'rotterdam', mode: 'sea', status: 'transit', etd: iso(-14), eta: iso(16) })
  return {
    emailLink: link, emailTest: `${base}p.html#${sample}`, emailKit: JSON.stringify(kit, null, 2),
    emailHtml: emailHtml({ cfg, link, imageBase: state.imageBase.trim() || 'https://YOUR-SITE.example/tracking/', esp, fields: state.fields, words: { heading: w.emailHeading, ref: w.ref, eta: t.eta, button: w.emailButton, alt: w.emailAlt } }),
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
    if (PRO) { $('warn-link').hidden = out.emailLink.length < 1800; $<HTMLAnchorElement>('email-test').href = out.emailTest }
    document.querySelectorAll<HTMLElement>('[data-when-lookup]').forEach(n => { n.hidden = state.linkData !== 'lookup' })
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
for (const [id, key] of [['source', 'source'], ['demo', 'demo'], ['pasted', 'pasted'], ['base', 'base'], ['esp', 'esp'], ['link-data', 'linkData'], ['link-style', 'linkStyle'], ['kit', 'kit'], ['image-base', 'imageBase']] as const) {
  const f = $<HTMLInputElement>(id); f.value = state[key]
  f.addEventListener('input', () => { state[key] = f.value; apply() })
}
for (const f of LINK_FIELDS) {
  const i = document.querySelector<HTMLInputElement>(`[data-field="${f}"]`)!; i.value = state.fields[f] ?? DEFAULT_FIELDS[f]
  i.addEventListener('input', () => { state.fields[f] = /^[\w.-]+$/.test(i.value) ? i.value : DEFAULT_FIELDS[f]; apply() })
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

document.querySelectorAll<HTMLElement>('[data-pro]').forEach(n => { n.hidden = !PRO })
document.querySelector<HTMLElement>('[data-pro-lock]')!.hidden = PRO
const notify = $<HTMLFormElement>('pro-notify')
notify.hidden = !__SUBSCRIBE_URL__
notify.addEventListener('submit', async e => {
  e.preventDefault()
  const out = notify.querySelector('small')!, email = notify.querySelector('input')!.value.trim()
  try {
    const r = await fetch(__SUBSCRIBE_URL__, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, source: 'pro:email_tracking', locale: document.documentElement.lang }) })
    if (!r.ok) throw new Error(String(r.status))
    out.textContent = out.dataset.thanks ?? ''
  } catch { out.textContent = out.dataset.error ?? '' }
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
// ── Email images ── a map with the status on it, one file per status.
const save = (href: string, name: string) => { const a = document.createElement('a'); a.href = href; a.download = name; a.click() }
const loadImage = (src: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
const nextFrame = () => new Promise(r => setTimeout(r, 60))
/** Goes to every recipient, so it must never show the shipments in the preview. */
async function withEmptyMap<T>(cfg: TrackerConfig, fn: () => Promise<T>): Promise<T> {
  preview.update({ ...cfg, shipments: [], feed: undefined, simulate: false, view: 'globe', autoRotate: false }); await nextFrame()
  try { return await fn() } finally { preview.update(cfg) }
}
function contain(g: CanvasRenderingContext2D, m: HTMLImageElement, W: number, H: number, cfg: TrackerConfig): void {
  const k = Math.min(W / m.width, H / m.height)
  g.fillStyle = cfg.theme.background ?? PALETTES[cfg.theme.preset === 'light' ? 'light' : 'dark'].bg; g.fillRect(0, 0, W, H)
  g.drawImage(m, (W - m.width * k) / 2, (H - m.height * k) / 2, m.width * k, m.height * k)
}
function statusBand(g: CanvasRenderingContext2D, W: number, H: number, band: number, status: Status, cfg: TrackerConfig): void {
  const dark = cfg.theme.preset !== 'light', pal = PALETTES[dark ? 'dark' : 'light'], t = words(pickLang(cfg.lang))
  const accent = cfg.theme.accent ?? '#5E6AD2', fg = cfg.theme.text ?? pal.text, order: Status[] = ['pending', 'transit', 'delivered']
  const at = status === 'delayed' ? 1 : order.indexOf(status), late = status === 'delayed'
  g.fillStyle = cfg.theme.panel ?? pal.panel; g.fillRect(0, H, W, band)
  const pad = W * .04, cell = (W - pad * 2) / 3, y = H + band * .42
  g.textBaseline = 'middle'
  order.forEach((st, i) => {
    g.fillStyle = i <= at ? (late && i === at ? '#f5a524' : accent) : fg + '33'
    g.fillRect(pad + i * cell, y - band * .3, cell - W * .012, Math.max(3, band * .05))
    g.fillStyle = i === at ? (late ? '#f5a524' : accent) : fg
    g.font = `${i === at ? 700 : 400} ${Math.round(band * .24)}px ${cfg.theme.font ?? 'Arial, sans-serif'}`
    g.fillText(i === at ? t[status] : t[st], pad + i * cell, y + band * .08)
  })
}
async function statusImage(status: Status, map: HTMLImageElement, cfg: TrackerConfig): Promise<string> {
  const W = 1200, H = 600, band = 120, c = document.createElement('canvas'); c.width = W; c.height = H + band
  const g = c.getContext('2d')!
  contain(g, map, W, H, cfg)
  statusBand(g, W, H, band, status, cfg)
  return c.toDataURL('image/png')
}
$('dl-images').addEventListener('click', async () => {
  const cfg = buildConfig()
  const data = await withEmptyMap(cfg, async () => preview.toPNG()); if (!data) return
  const map = await loadImage(data)
  for (const st of ['pending', 'transit', 'delayed', 'delivered'] as Status[]) { save(await statusImage(st, map, cfg), `tracking-${st}.png`); await nextFrame() }
})
$('dl-gif').addEventListener('click', async () => {
  const b = $<HTMLButtonElement>('dl-gif'), label = b.textContent, info = $('gif-size'), cfg = buildConfig()
  b.disabled = true; info.textContent = ''
  try {
    await withEmptyMap(cfg, async () => {
    const W = 480, H = 270, c = document.createElement('canvas'); c.width = W; c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })!, frames: ImageData[] = [], N = 24
    for (let i = 0; i < N; i++) {
      preview.rotate(360 / N); await nextFrame()
      const data = preview.toPNG(); if (!data) return
      contain(g, await loadImage(data), W, H, cfg)
      frames.push(g.getImageData(0, 0, W, H)); b.textContent = `${Math.round((i + 1) / N * 100)}%`
    }
    const bytes = encodeGif(frames, 12), url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'image/gif' }))
    save(url, 'tracking-globe.gif'); setTimeout(() => URL.revokeObjectURL(url), 5000)
    info.textContent = `${(bytes.length / 1048576).toFixed(1)} MB`
    })
  } finally { b.disabled = false; b.textContent = label }
})
$('dl-kit').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(brandKit(buildConfig()), null, 2)], { type: 'application/json' }))
  save(url, 'tracking-brand.json'); setTimeout(() => URL.revokeObjectURL(url), 5000)
})
$('reset').addEventListener('click', () => { try { localStorage.removeItem(STORE) } catch { /* private mode */ } location.reload() })
apply()
