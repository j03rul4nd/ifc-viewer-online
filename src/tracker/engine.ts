// ─── Tracking globe engine ───────────────────────────────────────────────────
// Sphere in WebGL (globe-gl), everything on top in a 2D canvas, UI in the shadow
// DOM. Draws only when something moves, stops when off-screen or the tab is
// hidden, respects reduced motion, and falls back to the flat map without WebGL.
import { normalizeConfig, normalizeShipments, PALETTES, resolveState, safeUrl, type Shipment, type Status, type TrackerConfig } from './config'
import { GlobeGL } from './globe-gl'
import { pickLang, words, type Key } from './i18n'
import { LAND } from './land-data'
import type { Controller, Mount } from './loader'
import { measure, pointAt, progressOf, resolvePlace, routeFor, type Hub, type Measured } from './routes'

type LL = [number, number]
const RAD = Math.PI / 180

const CSS = `
:host{--ln:color-mix(in srgb,var(--tx) 14%,transparent);--mt:color-mix(in srgb,var(--tx) 62%,transparent);display:block;position:relative;color:var(--tx);font-size:13px;line-height:1.4}
*{box-sizing:border-box}
.w{position:absolute;inset:0;display:flex;background:var(--bg);overflow:hidden;border-radius:inherit}
.st{position:relative;flex:1;min-width:0;touch-action:pan-y;cursor:grab;outline:0}.st.nd{cursor:default}.st.dr{cursor:grabbing}
.w.fs .st{touch-action:none}
canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.hd{position:absolute;left:12px;top:12px;display:flex;align-items:center;gap:8px;pointer-events:none;max-width:calc(100% - 24px)}
.hd img{height:24px;max-width:120px;object-fit:contain}.hd b,.lg span{text-shadow:0 0 3px var(--bg),0 0 3px var(--bg)}.hd b{font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sim{padding:2px 8px;border-radius:99px;font-size:11px;background:color-mix(in srgb,#f5a524 18%,var(--pn));color:#f5a524;border:1px solid color-mix(in srgb,#f5a524 40%,transparent);white-space:nowrap}
.tb{position:absolute;right:12px;top:12px;display:flex;flex-direction:column;gap:6px}
.g{display:flex;flex-direction:column;background:var(--pn);border:1px solid var(--ln);border-radius:8px;overflow:hidden}
button{all:unset;box-sizing:border-box;cursor:pointer;display:grid;place-items:center;width:32px;height:32px;color:var(--tx);font-size:12px}
button:hover{background:var(--ln)}button:focus-visible,input:focus-visible,.it:focus-visible{outline:2px solid var(--a);outline-offset:-2px}
svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.lg{position:absolute;left:12px;bottom:22px;display:flex;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--mt);pointer-events:none}
.lg i,.pl i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-inline-end:5px;vertical-align:1px}
.cr{position:absolute;right:8px;bottom:4px;font-size:10px;color:var(--mt)}.cr a{color:inherit;text-decoration:none}.cr a:hover{text-decoration:underline}
.pn{width:292px;flex:none;display:flex;flex-direction:column;background:var(--pn);border-inline-start:1px solid var(--ln);min-height:0}
.w.nr button{width:40px;height:40px}.w.nr{flex-direction:column}.w.nr .pn{width:auto;height:44%;border-inline-start:0;border-top:1px solid var(--ln)}
.ph{padding:12px 14px 8px;font-weight:600;display:flex;justify-content:space-between}.ph span{color:var(--mt);font-weight:400;font-variant-numeric:tabular-nums}
.sr{padding:0 10px 8px}input{width:100%;height:32px;padding:0 10px;color:var(--tx);background:transparent;border:1px solid var(--ln);border-radius:8px;font:inherit;font-size:16px;outline:0}
@media (min-width:768px){input{font-size:13px}}input::placeholder{color:var(--mt)}
.ls{flex:1;overflow:auto;min-height:0;overscroll-behavior:contain;list-style:none;margin:0;padding:0}
.it{display:block;padding:10px 14px;border-top:1px solid var(--ln);cursor:pointer;outline:0}.it:hover{background:color-mix(in srgb,var(--tx) 5%,transparent)}
.it[aria-selected=true]{background:color-mix(in srgb,var(--a) 16%,transparent);box-shadow:inset 2px 0 var(--a)}
.r1{display:flex;justify-content:space-between;gap:8px}.id{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pl{white-space:nowrap;font-size:11px;color:var(--mt)}
.r2{color:var(--mt);margin-top:2px;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.br{height:3px;border-radius:2px;background:var(--ln);margin-top:7px;overflow:hidden}.br>div{height:100%;background:var(--a)}
.r3{display:flex;justify-content:space-between;color:var(--mt);margin-top:5px;font-size:11px;font-variant-numeric:tabular-nums}
.no{padding:18px 14px;color:var(--mt);text-align:center}
.er{position:absolute;left:50%;transform:translateX(-50%);top:12px;padding:5px 10px;border-radius:8px;background:var(--pn);border:1px solid var(--ln);font-size:12px;white-space:nowrap}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
`
const ICON: Record<string, string> = {
  plus: '<path d="M8 3v10M3 8h10"/>', minus: '<path d="M3 8h10"/>',
  fs: '<path d="M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3"/>',
  globe: '<circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c2 2 2 9 0 11M8 2.5c-2 2-2 9 0 11"/>',
  map: '<path d="M2.5 4.5l3.5-1.5 4 1.5 3.5-1.5v8.5L10 12.500l-4-1.500-3.500 1.500zM6 3v8M10 4.500v8"/>',
}
const svg = (n: string) => `<svg viewBox="0 0 16 16" aria-hidden="true">${ICON[n]}</svg>`
const STATUS_COLOR: Record<Status, string> = { pending: '#8b95a7', transit: '', delayed: '#f5a524', delivered: '#30b56f' }

function hex(c: string): number[] {
  const m = c.match(/^#([0-9a-f]{3,8})$/i)
  if (!m) { const r = c.match(/[\d.]+/g); return r ? r.slice(0, 3).map(n => +n / 255) : [0, 0, 0] }
  const h = m[1].length < 6 ? [...m[1].slice(0, 3)].map(x => x + x).join('') : m[1]
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
}
let RINGS: LL[][] | null = null
function rings(): LL[][] {
  return RINGS ??= LAND.split(';').map(r => {
    const n = r.split(' '); let x = 0, y = 0; const out: LL[] = []
    for (let i = 0; i < n.length; i += 2) { x += +n[i]; y += +n[i + 1]; out.push([x / 10, y / 10]) }
    return out
  })
}
let MASK: HTMLCanvasElement | null = null
function landMask(): HTMLCanvasElement {
  if (MASK) return MASK
  const c = document.createElement('canvas'); c.width = 2048; c.height = 1024
  const g = c.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, 2048, 1024); g.fillStyle = '#fff'
  g.beginPath()
  for (const r of rings()) r.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * 2048, y = (90 - la) / 180 * 1024; if (i) g.lineTo(x, y); else g.moveTo(x, y) })
  g.fill('evenodd')
  return MASK = c
}

interface Item { s: Shipment; from: Hub | null; to: Hub | null; route: Measured | null; progress: number; status: Status; at: LL | null; simOffset: number }

const mount: Mount = (host, root, initial) => {
  let cfg: TrackerConfig = initial
  let t: Record<Key, string> = words(pickLang(cfg.lang))
  let items: Item[] = []
  let selected: string | null = null
  let filter = ''
  let view: 'globe' | 'map' = cfg.view
  let glFailed = false
  let lat = 26, lng = 62, zoom = 1, mapX = 40, mapY = 25, mapZoom = 1
  let spin = cfg.autoRotate, tween: { lat: number; lng: number; x: number; y: number; t0: number; flat0: [number, number]; from: [number, number] } | null = null
  let W = 0, H = 0, dpr = 1, raf = 0, visible = true, dirty = true, disposed = false, lastT = 0, lastList = 0, fullscreen = false
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let feedTimer = 0

  root.innerHTML = `<style>${CSS}</style><style class="th"></style><div class="w" part="root"><div class="st" part="stage" tabindex="0" role="application"><canvas class="c1"></canvas><canvas class="c2"></canvas><div class="hd" part="header"></div><div class="tb" part="toolbar"></div><div class="lg" part="legend"></div><div class="cr"><a href="https://www.ifcvieweronline.eu/tracking-globe/" target="_blank" rel="noopener">IFC Viewer Online</a></div></div><aside class="pn" part="panel"><div class="ph"><b class="pt"></b><span class="pc"></span></div><div class="sr"><input type="search" part="search"></div><ul class="ls" role="listbox"></ul></aside><div class="sr-only" aria-live="polite"></div></div>`
  const $ = <T extends Element>(q: string) => root.querySelector(q) as T
  const w = $<HTMLElement>('.w'), stage = $<HTMLElement>('.st'), c1 = $<HTMLCanvasElement>('.c1'), c2 = $<HTMLCanvasElement>('.c2'), panel = $<HTMLElement>('.pn'), list = $<HTMLElement>('.ls'), input = $<HTMLInputElement>('input')
  const g2 = c2.getContext('2d')!
  let gl: GlobeGL | null = null
  let flatDots: LL[] | null = null
  let colors = { ocean: '', land: '', accent: '', muted: '', bg: '', text: '' }

  function applyTheme(): void {
    const th = cfg.theme
    const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
    const dark = th.preset === 'dark' || (th.preset === 'auto' && prefersDark)
    const base = PALETTES[dark ? 'dark' : 'light']
    const accent = th.accent ?? '#5E6AD2'
    colors = { ocean: th.ocean ?? base.ocean, land: th.land ?? base.land, accent, muted: dark ? 'rgba(232,235,241,.28)' : 'rgba(26,33,48,.28)', bg: th.background ?? base.bg, text: th.text ?? base.text }
    // The configured values are fallbacks: --tg-* set in the host's own stylesheet win.
    $<HTMLStyleElement>('.th').textContent = `:host{--a:var(--tg-accent,${accent});--bg:var(--tg-background,${colors.bg});--tx:var(--tg-text,${colors.text});--pn:var(--tg-panel,${th.panel ?? base.panel});font-family:var(--tg-font,${th.font ?? 'inherit'})}`
    const cs = getComputedStyle(host)
    colors.accent = cs.getPropertyValue('--a').trim() || accent; colors.bg = cs.getPropertyValue('--bg').trim() || colors.bg; colors.text = cs.getPropertyValue('--tx').trim() || colors.text
    host.style.borderRadius = `${th.radius}px`
    host.style.background = colors.bg === 'transparent' ? 'transparent' : colors.bg
    dirty = true
  }

  // ── Data ──
  function rebuild(list: Shipment[]): void {
    items = list.map((s, i) => {
      const from = resolvePlace(s.from), to = resolvePlace(s.to)
      const route = from && to ? measure(routeFor(from, to, s.mode)) : null
      return { s, from, to, route, progress: 0, status: 'pending' as Status, at: null, simOffset: i * .137 % 1 }
    })
    refresh(performance.now()); renderList(); dirty = true
  }
  function refresh(now: number): void {
    for (const it of items) {
      const st = resolveState(it.s, Date.now())
      it.status = st.status; it.progress = st.progress
      if (cfg.simulate && it.route && st.status !== 'delivered' && st.status !== 'pending') {
        it.progress = (st.progress + it.simOffset * .4 + now / 1000 * cfg.speed / 240) % 1
      }
      if (it.route && it.s.position && !cfg.simulate) { it.progress = progressOf(it.route, it.s.position); it.at = it.s.position }
      else it.at = it.route ? pointAt(it.route, it.progress).at : null
    }
  }
  const colorOf = (it: Item) => STATUS_COLOR[it.status] || colors.accent
  const visibleItems = () => filter ? items.filter(i => `${i.s.id} ${i.s.label ?? ''}`.toLowerCase().includes(filter)) : items

  function fmtDate(iso?: string): string {
    if (!iso) return ''
    const d = new Date(iso)
    return isNaN(+d) ? iso : d.toLocaleDateString(pickLang(cfg.lang), { day: 'numeric', month: 'short' })
  }
  function renderList(): void {
    const vis = visibleItems()
    $('.pc').textContent = String(vis.length)
    list.textContent = ''
    if (!vis.length) { const li = document.createElement('li'); li.className = 'no'; li.textContent = t.none; list.appendChild(li); return }
    for (const it of vis) {
      const li = document.createElement('li'); li.className = 'it'; li.setAttribute('role', 'option'); li.tabIndex = 0; li.part.add('item')
      li.setAttribute('aria-selected', String(it.s.id === selected)); li.dataset.id = it.s.id
      const row = (cls: string, parts: [string, string][]) => { const d = document.createElement('div'); d.className = cls; for (const [c, tx] of parts) { const e = document.createElement('span'); if (c) e.className = c; e.textContent = tx; d.appendChild(e) } return d }
      const r1 = row('r1', [['id', it.s.id], ['pl', t[it.status]]])
      const dot = document.createElement('i'); dot.style.background = colorOf(it); r1.lastElementChild!.prepend(dot)
      li.appendChild(r1)
      const routeText = it.from && it.to ? `${it.from.name} → ${it.to.name} · ${t[it.s.mode]}` : t.unknownPlace
      li.appendChild(row('r2', [['', it.s.label ? `${it.s.label} · ${routeText}` : routeText]]))
      const br = document.createElement('div'); br.className = 'br'; const f = document.createElement('div'); f.style.width = `${Math.round(it.progress * 100)}%`; f.style.background = colorOf(it); br.appendChild(f); li.appendChild(br)
      li.appendChild(row('r3', [['', `${Math.round(it.progress * 100)}% ${t.done}`], ['', it.s.eta ? `${t.eta} ${fmtDate(it.s.eta)}` : '']]))
      if (it.s.note) li.appendChild(row('r2', [['', it.s.note]]))
      list.appendChild(li)
    }
  }
  function renderChrome(): void {
    const c = cfg.controls
    t = words(pickLang(cfg.lang))
    const hd = $<HTMLElement>('.hd'); hd.textContent = ''
    const logo = safeUrl(cfg.logo); if (logo) { const i = document.createElement('img'); i.src = logo; i.alt = cfg.title ?? ''; i.referrerPolicy = 'no-referrer'; hd.appendChild(i) }
    if (cfg.title) { const b = document.createElement('b'); b.textContent = cfg.title; hd.appendChild(b) }
    // Not optional: a visitor must never take a simulation for a real shipment.
    if (cfg.simulate) { const s = document.createElement('span'); s.className = 'sim'; s.textContent = t.simulated; hd.appendChild(s) }
    const tb = $<HTMLElement>('.tb'); tb.textContent = ''
    const btn = (icon: string, label: string, fn: () => void, g: HTMLElement) => { const b = document.createElement('button'); b.innerHTML = svg(icon); b.title = label; b.setAttribute('aria-label', label); b.onclick = fn; g.appendChild(b) }
    const group = () => { const d = document.createElement('div'); d.className = 'g'; tb.appendChild(d); return d }
    if (c.zoom) { const g = group(); btn('plus', t.zoomIn, () => zoomBy(1.3), g); btn('minus', t.zoomOut, () => zoomBy(1 / 1.3), g) }
    if (c.viewSwitch && !glFailed) { const g = group(); btn(view === 'globe' ? 'map' : 'globe', view === 'globe' ? t.map : t.globe, () => setView(view === 'globe' ? 'map' : 'globe'), g) }
    if (c.fullscreen && host.requestFullscreen) { const g = group(); btn('fs', t.fullscreen, () => { if (document.fullscreenElement) void document.exitFullscreen(); else void host.requestFullscreen() }, g) }
    const lg = $<HTMLElement>('.lg'); lg.textContent = ''
    if (c.legend) for (const st of ['transit', 'delayed', 'delivered', 'pending'] as Status[]) {
      if (!items.some(i => i.status === st)) continue
      const s = document.createElement('span'); const d = document.createElement('i'); d.style.background = STATUS_COLOR[st] || colors.accent; s.append(d, t[st]); lg.appendChild(s)
    }
    panel.style.display = c.list ? '' : 'none'
    $<HTMLElement>('.sr').style.display = c.search || cfg.lookup ? '' : 'none'
    input.placeholder = t.search; input.setAttribute('aria-label', t.search)
    $('.pt').textContent = t.shipments
    stage.classList.toggle('nd', !c.drag)
    stage.setAttribute('aria-label', cfg.title ?? t.shipments)
    list.setAttribute('aria-label', t.shipments)
  }

  // ── Projection ──
  function project(la: number, lo: number): { x: number; y: number; z: number } {
    const R = baseR() * zoom, ph = la * RAD, dl = (lo - lng) * RAD, p0 = lat * RAD
    const cp = Math.cos(ph)
    return { x: W / 2 + R * cp * Math.sin(dl), y: H / 2 - R * (Math.sin(ph) * Math.cos(p0) - cp * Math.sin(p0) * Math.cos(dl)), z: Math.sin(ph) * Math.sin(p0) + cp * Math.cos(p0) * Math.cos(dl) }
  }
  const baseR = () => Math.min(W, H) * .43
  const mapScale = () => Math.max(W / 360, H / 150) * mapZoom
  const mapPt = (la: number, lo: number) => { const k = mapScale(); return { x: W / 2 + (lo - mapX) * k, y: H / 2 - (la - mapY) * k } }

  // ── Drawing ──
  // On a pale ocean a saturated rim looks like a bruise: tone it towards the ocean.
  function glowColor(): number[] {
    const a = hex(colors.accent), o = hex(colors.ocean), lum = o[0] * .3 + o[1] * .6 + o[2] * .1
    return lum > .5 ? a.map((v, i) => v * .3 + o[i] * .7) : a
  }
  function drawGlobeRoute(it: Item, sel: boolean): void {
    const m = it.route!, n = m.points.length, split = pointAt(m, it.progress).index
    const seg = (a: number, b: number, color: string, width: number, dash: number[]) => {
      g2.beginPath(); g2.strokeStyle = color; g2.lineWidth = width; g2.setLineDash(dash)
      let pen = false
      for (let i = a; i < b; i++) {
        const [la, lo] = m.points[i]; const p = project(la, lo)
        if (p.z < 0) { pen = false; continue }
        if (pen) g2.lineTo(p.x, p.y); else g2.moveTo(p.x, p.y)
        pen = true
      }
      g2.stroke()
    }
    seg(Math.max(0, split - 1), n, colors.muted, sel ? 1.4 : 1, [3, 4])
    seg(0, split, colorOf(it), sel ? 2.4 : 1.5, [])
  }
  function drawFlatRoute(it: Item, sel: boolean): void {
    const m = it.route!, split = pointAt(m, it.progress).index
    const seg = (a: number, b: number, color: string, width: number, dash: number[]) => {
      g2.beginPath(); g2.strokeStyle = color; g2.lineWidth = width; g2.setLineDash(dash)
      for (const shift of [-360, 0, 360]) {
        let pen = false, prev = 0
        for (let i = a; i < b; i++) {
          const [la, lo] = m.points[i]
          if (pen && Math.abs(lo - prev) > 180) pen = false
          prev = lo
          const p = mapPt(la, lo + shift)
          if (pen) g2.lineTo(p.x, p.y); else g2.moveTo(p.x, p.y)
          pen = true
        }
      }
      g2.stroke()
    }
    seg(Math.max(0, split - 1), m.points.length, colors.muted, sel ? 1.4 : 1, [3, 4])
    seg(0, split, colorOf(it), sel ? 2.4 : 1.5, [])
  }
  function flatLand(): void {
    const k = mapScale()
    g2.fillStyle = colors.ocean; g2.fillRect(0, 0, W, H)
    g2.fillStyle = colors.land
    if (cfg.theme.landStyle === 'dots') {
      if (!flatDots) {
        const m = landMask().getContext('2d')!.getImageData(0, 0, 2048, 1024).data
        flatDots = []
        for (let la = 84; la > -84; la -= 1.6) for (let lo = -180; lo < 180; lo += 1.6) {
          const x = Math.floor((lo + 180) / 360 * 2048), y = Math.floor((90 - la) / 180 * 1024)
          if (m[(y * 2048 + x) * 4] > 127) flatDots.push([la, lo])
        }
      }
      const r = Math.max(.7, 1.6 * k * .3)
      g2.beginPath()
      for (const shift of [-360, 0, 360]) for (const [la, lo] of flatDots) {
        const p = mapPt(la, lo + shift)
        if (p.x < -2 || p.x > W + 2 || p.y < -2 || p.y > H + 2) continue
        g2.rect(p.x - r, p.y - r, r * 2, r * 2)
      }
      g2.fill()
    } else {
      g2.beginPath()
      for (const shift of [-360, 0, 360]) for (const r of rings()) r.forEach(([lo, la], i) => { const p = mapPt(la, lo + shift); if (i) g2.lineTo(p.x, p.y); else g2.moveTo(p.x, p.y) })
      g2.fill('evenodd')
    }
  }
  function marker(x: number, y: number, it: Item, sel: boolean, pulse: number): void {
    const color = colorOf(it)
    if (it.status === 'transit' && !reduced) {
      g2.beginPath(); g2.arc(x, y, (sel ? 7 : 5) + pulse * 7, 0, 7); g2.fillStyle = color; g2.globalAlpha = .28 * (1 - pulse); g2.fill(); g2.globalAlpha = 1
    }
    g2.beginPath(); g2.arc(x, y, sel ? 5.5 : 3.8, 0, 7); g2.fillStyle = color; g2.fill()
    g2.lineWidth = 1.5; g2.strokeStyle = colors.bg === 'transparent' ? '#fff' : colors.bg; g2.setLineDash([]); g2.stroke()
  }
  function label(x: number, y: number, text: string, strong = false): void {
    g2.font = `${strong ? 600 : 400} 11px ${getComputedStyle(host).fontFamily || 'system-ui'}`
    g2.textBaseline = 'middle'
    const tw = g2.measureText(text).width, lx = Math.min(W - tw - 6, x + 8)
    g2.lineWidth = 3; g2.strokeStyle = colors.bg === 'transparent' ? colors.ocean : colors.bg; g2.setLineDash([]); g2.strokeText(text, lx, y)
    g2.fillStyle = colors.text; g2.fillText(text, lx, y)
  }
  function draw(now: number): void {
    const flat = view === 'map' || glFailed
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, W, H)
    c1.style.display = flat ? 'none' : ''
    if (flat) flatLand()
    else gl?.draw({ R: baseR() * zoom * dpr, cx: W * dpr / 2, cy: H * dpr / 2, lat, lng, dots: cfg.theme.landStyle === 'dots', ocean: hex(colors.ocean), land: hex(colors.land), glow: glowColor() })
    const vis = visibleItems(), pulse = (now / 1600) % 1
    g2.lineCap = 'round'; g2.lineJoin = 'round'
    for (const it of vis) if (it.route && it.s.id !== selected) (flat ? drawFlatRoute : drawGlobeRoute)(it, false)
    const sel = vis.find(i => i.s.id === selected)
    if (sel?.route) (flat ? drawFlatRoute : drawGlobeRoute)(sel, true)
    const pos = (la: number, lo: number) => flat ? { ...mapPt(la, ((lo - mapX + 540) % 360) - 180 + mapX), z: 1 } : project(la, lo)
    for (const it of vis) {
      if (!it.at) continue
      const p = pos(it.at[0], it.at[1]); if (p.z < 0) continue
      marker(p.x, p.y, it, it.s.id === selected, pulse)
    }
    if (sel) {
      for (const h of [sel.from, sel.to]) if (h) {
        const p = pos(h.at[0], h.at[1]); if (p.z < 0) continue
        g2.beginPath(); g2.arc(p.x, p.y, 3, 0, 7); g2.fillStyle = colors.text; g2.fill()
        label(p.x, p.y, h.name)
      }
      if (sel.at) { const p = pos(sel.at[0], sel.at[1]); if (p.z >= 0) label(p.x, p.y - 12, sel.s.id, true) }
    }
  }

  // ── Loop ── draws on demand; only motion asks for the next frame.
  function frame(now: number): void {
    raf = 0; clearTimeout(timer)
    if (disposed || !visible || document.hidden || !W) return
    const dt = Math.min(100, now - lastT); lastT = now
    let moving = false
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / 700), e = k * k * (3 - 2 * k)
      let dl = tween.lng - tween.from[1]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360
      lat = tween.from[0] + (tween.lat - tween.from[0]) * e; lng = tween.from[1] + dl * e
      mapX = tween.flat0[0] + (tween.x - tween.flat0[0]) * e; mapY = tween.flat0[1] + (tween.y - tween.flat0[1]) * e
      if (k >= 1) tween = null
      moving = true
    }
    if (spin && !reduced && view === 'globe' && !glFailed && !tween) { lng = (lng + dt * .004 + 540) % 360 - 180; moving = true }
    if (!reduced && items.some(i => i.status === 'transit')) moving = true
    if (cfg.simulate && !reduced) refresh(now)
    if (now - lastList > (cfg.simulate ? 1000 : 30000)) { lastList = now; if (!cfg.simulate) refresh(now); updateBars() }
    if (moving || dirty) { draw(now); dirty = false }
    // Pulses and slow spin read fine at 30 fps, and the host page keeps its budget.
    if (moving) { const next = () => { if (!raf) raf = requestAnimationFrame(frame) }; if (tween || dragging) next(); else timer = window.setTimeout(next, 33) }
  }
  let timer = 0
  function kick(): void { dirty = true; if (!raf && !disposed) raf = requestAnimationFrame(frame) }
  function updateBars(): void {
    list.querySelectorAll<HTMLElement>('.it').forEach(li => {
      const it = items.find(i => i.s.id === li.dataset.id); if (!it) return
      const pct = `${Math.round(it.progress * 100)}%`
      ;(li.querySelector('.br>div') as HTMLElement).style.width = pct
      ;(li.querySelector('.r3 span') as HTMLElement).textContent = `${pct} ${t.done}`
    })
  }

  // ── Interaction ──
  function zoomBy(f: number): void {
    if (view === 'map' || glFailed) mapZoom = Math.min(10, Math.max(1, mapZoom * f))
    else zoom = Math.min(5, Math.max(.8, zoom * f))
    spin = false; kick()
  }
  function setView(v: 'globe' | 'map'): void {
    if (v === view) return
    view = v
    if (v === 'map') { mapX = lng; mapY = Math.max(-30, Math.min(55, lat)) } else { lng = mapX; lat = mapY }
    renderChrome(); kick()
  }
  function select(id: string | null, fly = true): void {
    selected = id
    list.querySelectorAll('.it').forEach(el => {
      const on = (el as HTMLElement).dataset.id === id; el.setAttribute('aria-selected', String(on))
      if (on) el.scrollIntoView({ block: 'nearest' })
    })
    const it = items.find(i => i.s.id === id)
    if (it) {
      $('.sr-only').textContent = `${it.s.id}: ${t[it.status]}, ${Math.round(it.progress * 100)}%`
      if (it.at && fly) {
        spin = false
        const tgt = it.at
        if (reduced) { lat = tgt[0]; lng = tgt[1]; mapX = tgt[1]; mapY = tgt[0] }
        else tween = { lat: Math.max(-60, Math.min(60, tgt[0])), lng: tgt[1], x: tgt[1], y: tgt[0], t0: performance.now(), flat0: [mapX, mapY], from: [lat, lng] }
      }
    }
    host.dispatchEvent(new CustomEvent('tg-select', { detail: { id, shipment: it?.s ?? null }, bubbles: true, composed: true }))
    try { if (parent !== window) parent.postMessage({ source: 'tracking-globe', type: 'select', id }, '*') } catch { /* sandboxed */ }
    kick()
  }
  let dragging = false, sx = 0, sy = 0, s0: number[] = [], moved = false, activeTouch = false
  const pointers = new Map<number, [number, number]>()
  let pinch0 = 0, pinchZ = 1
  stage.addEventListener('pointerdown', e => {
    if ((e.target as Element).closest('button')) return
    pointers.set(e.pointerId, [e.clientX, e.clientY])
    if (pointers.size === 2 && cfg.controls.zoom) { const [a, b] = [...pointers.values()]; pinch0 = Math.hypot(a[0] - b[0], a[1] - b[1]); pinchZ = view === 'map' ? mapZoom : zoom }
    sx = e.clientX; sy = e.clientY; moved = false; activeTouch = e.pointerType === 'touch'
    s0 = [lat, lng, mapX, mapY]
    if (cfg.controls.drag) { dragging = true; try { stage.setPointerCapture(e.pointerId) } catch { /* released */ }; stage.classList.add('dr') }
  })
  stage.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY])
    if (pointers.size === 2 && pinch0) {
      const [a, b] = [...pointers.values()], k = Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch0
      if (view === 'map') mapZoom = Math.min(10, Math.max(1, pinchZ * k)); else zoom = Math.min(5, Math.max(.8, pinchZ * k))
      kick(); return
    }
    if (!dragging) return
    const dx = e.clientX - sx, dy = e.clientY - sy
    if (Math.hypot(dx, dy) > 4) moved = true
    if (!moved) return
    spin = false; tween = null
    if (view === 'map' || glFailed) { const k = mapScale(); mapX = s0[2] - dx / k; mapY = Math.max(-70, Math.min(80, s0[3] + dy / k)) }
    else { const k = 90 / (baseR() * zoom); lng = ((s0[1] - dx * k + 540) % 360) - 180; lat = Math.max(-80, Math.min(80, s0[0] + dy * k)) }
    kick()
  })
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch0 = 0
    if (!dragging) { if (!moved && e.type === 'pointerup') hit(e); return }
    dragging = false; stage.classList.remove('dr')
    if (!moved && e.type === 'pointerup') hit(e)
  }
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end)
  function hit(e: PointerEvent): void {
    const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    let best: Item | null = null, min = activeTouch ? 24 : 12
    for (const it of visibleItems()) {
      if (!it.at) continue
      const p = view === 'map' || glFailed ? { ...mapPt(it.at[0], ((it.at[1] - mapX + 540) % 360) - 180 + mapX), z: 1 } : project(it.at[0], it.at[1])
      if (p.z < 0) continue
      const d = Math.hypot(p.x - x, p.y - y); if (d < min) { min = d; best = it }
    }
    if (best) select(best.s.id)
  }
  // The wheel belongs to the host page unless the visitor asks: Ctrl/⌘ + wheel.
  stage.addEventListener('wheel', e => {
    if (!cfg.controls.zoom || !(e.ctrlKey || e.metaKey || fullscreen)) return
    e.preventDefault(); zoomBy(Math.exp(-e.deltaY * .002))
  }, { passive: false })
  stage.addEventListener('keydown', e => {
    const step: Record<string, [number, number]> = { ArrowLeft: [0, -8], ArrowRight: [0, 8], ArrowUp: [8, 0], ArrowDown: [-8, 0] }
    if (step[e.key] && cfg.controls.drag) {
      e.preventDefault(); spin = false
      if (view === 'map') { mapX += step[e.key][1]; mapY += step[e.key][0] } else { lat = Math.max(-80, Math.min(80, lat + step[e.key][0])); lng += step[e.key][1] }
      kick()
    } else if ((e.key === '+' || e.key === '=') && cfg.controls.zoom) zoomBy(1.3)
    else if (e.key === '-' && cfg.controls.zoom) zoomBy(1 / 1.3)
  })
  list.addEventListener('click', e => { const li = (e.target as Element).closest<HTMLElement>('.it'); if (li?.dataset.id) select(li.dataset.id) })
  list.addEventListener('keydown', e => {
    const li = (e.target as Element).closest<HTMLElement>('.it'); if (!li) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(li.dataset.id!) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); (li.nextElementSibling as HTMLElement | null)?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); (li.previousElementSibling as HTMLElement | null)?.focus() }
  })
  input.addEventListener('input', () => { filter = input.value.trim().toLowerCase(); renderList(); kick() })
  input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter' || !cfg.lookup || !input.value.trim()) return
    if (visibleItems().length) { select(visibleItems()[0].s.id); return }
    // A single reference from the host's own endpoint: nothing else is ever exposed to this visitor.
    try {
      const r = await fetch(cfg.lookup.replace('{id}', encodeURIComponent(input.value.trim())), { credentials: 'omit' })
      if (!r.ok) throw new Error(String(r.status))
      const body = await r.json()
      const got = normalizeShipments(Array.isArray(body) || body?.shipments ? body : [body])
      if (!got.length) throw new Error('empty')
      const known = items.map(i => i.s).filter(s => !got.some(g => g.id === s.id))
      filter = ''; input.value = ''; rebuild([...known, ...got]); renderChrome(); select(got[0].id)
    } catch { flash(t.lookupError) }
  })
  function flash(text: string): void {
    root.querySelector('.er')?.remove()
    const d = document.createElement('div'); d.className = 'er'; d.setAttribute('role', 'status'); d.textContent = text; stage.appendChild(d)
    setTimeout(() => d.remove(), 4000)
  }

  // ── Feed ── from the visitor's browser straight to the host's endpoint; we never see it.
  async function pull(): Promise<void> {
    if (!cfg.feed || document.hidden) return
    try {
      const r = await fetch(cfg.feed, { credentials: 'omit', cache: 'no-cache' })
      if (!r.ok) throw new Error(String(r.status))
      rebuild(normalizeShipments(await r.json())); renderChrome()
      host.dispatchEvent(new CustomEvent('tg-data', { detail: { count: items.length }, bubbles: true, composed: true }))
    } catch { flash(t.feedError); host.dispatchEvent(new CustomEvent('tg-error', { detail: { reason: 'feed' }, bubbles: true, composed: true })) }
  }
  function startFeed(): void {
    clearInterval(feedTimer)
    if (cfg.feed) { void pull(); feedTimer = window.setInterval(() => void pull(), cfg.feedInterval * 1000) }
  }

  // ── Size & lifecycle ──
  function resize(): void {
    // Layout first: the panel moving under the stage is what changes the stage's size.
    w.classList.toggle('nr', host.clientWidth < 640)
    const r = stage.getBoundingClientRect()
    W = r.width; H = r.height; dpr = Math.min(2, devicePixelRatio || 1)
    for (const c of [c1, c2]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr) }
    kick()
  }
  const ro = new ResizeObserver(resize)
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick() })
  const onVis = () => { if (!document.hidden) kick() }
  const onFs = () => { fullscreen = document.fullscreenElement === host; w.classList.toggle('fs', fullscreen); kick() }
  const onMsg = (e: MessageEvent) => {
    if (e.source !== parent || parent === window || !e.data || typeof e.data !== 'object') return
    const d = e.data as { target?: string; shipments?: unknown; id?: string; view?: 'globe' | 'map' }
    if (d.target !== 'tracking-globe') return
    if (d.shipments) { rebuild(normalizeShipments(d.shipments)); renderChrome() }
    if (d.id !== undefined) select(d.id)
    if (d.view) setView(d.view)
  }
  const scheme = matchMedia('(prefers-color-scheme: dark)')
  const onScheme = () => { if (cfg.theme.preset === 'auto') { applyTheme(); kick() } }
  scheme.addEventListener('change', onScheme)
  addEventListener('message', onMsg); document.addEventListener('visibilitychange', onVis); document.addEventListener('fullscreenchange', onFs)
  c1.addEventListener('webglcontextlost', e => { e.preventDefault(); glFailed = true; renderChrome(); kick() })

  try { gl = new GlobeGL(c1, landMask()) } catch { glFailed = true; view = 'map' }
  applyTheme(); renderChrome(); rebuild(cfg.shipments); renderChrome(); ro.observe(host); ro.observe(stage); io.observe(host); resize(); startFeed()
  // Open on the first shipment's part of the world, not on the Pacific.
  function recenter(): void {
    const first = items.find(i => i.at)
    if (first?.from && first.to) {
      const a = first.from.at, b = first.to.at; let dl = b[1] - a[1]; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360
      lng = ((a[1] + dl / 2 + 540) % 360) - 180; lat = Math.max(-35, Math.min(45, (a[0] + b[0]) / 2)); mapX = lng; mapY = Math.max(-20, Math.min(45, lat))
    }
  }
  recenter()
  queueMicrotask(() => host.dispatchEvent(new CustomEvent('tg-ready', { bubbles: true, composed: true })))
  try { if (parent !== window) parent.postMessage({ source: 'tracking-globe', type: 'ready' }, '*') } catch { /* sandboxed */ }

  const ctl: Controller = {
    call(m, a) {
      if (m === 'setShipments') { rebuild(normalizeShipments(a[0])); renderChrome(); return }
      if (m === 'select') return select(a[0] as string | null)
      if (m === 'setView') return setView(a[0] as 'globe' | 'map')
      if (m === 'update') {
        cfg = normalizeConfig(a[0]); if (host.getAttribute('height') !== 'fill') host.style.height = `${cfg.height}px`
        view = glFailed ? 'map' : cfg.view; spin = cfg.autoRotate; filter = ''; input.value = ''
        applyTheme(); rebuild(cfg.shipments); renderChrome(); recenter(); startFeed(); return
      }
      if (m === 'toPNG') {
        draw(performance.now())
        const out = document.createElement('canvas'); out.width = c2.width; out.height = c2.height
        const g = out.getContext('2d')!; g.fillStyle = colors.bg === 'transparent' ? '#fff' : colors.bg; g.fillRect(0, 0, out.width, out.height)
        if (view === 'globe' && !glFailed) g.drawImage(c1, 0, 0)
        g.drawImage(c2, 0, 0)
        return out.toDataURL('image/png')
      }
      return undefined
    },
    dispose() {
      disposed = true; cancelAnimationFrame(raf); clearTimeout(timer); clearInterval(feedTimer); ro.disconnect(); io.disconnect()
      removeEventListener('message', onMsg); document.removeEventListener('visibilitychange', onVis); document.removeEventListener('fullscreenchange', onFs); scheme.removeEventListener('change', onScheme)
      gl?.gl.getExtension('WEBGL_lose_context')?.loseContext()
      root.innerHTML = ''
    },
  }
  return ctl
}

const G = window as unknown as { __trackingGlobeEngine?: Mount; __trackingGlobeWaiters?: ((m: Mount) => void)[] }
G.__trackingGlobeEngine = mount
for (const f of G.__trackingGlobeWaiters ?? []) f(mount)
G.__trackingGlobeWaiters = undefined
