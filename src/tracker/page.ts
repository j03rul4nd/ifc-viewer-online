// ─── Tracking page ───────────────────────────────────────────────────────────
// What a recipient opens from the email: one shipment under the sender's brand.
// Static: the shipment comes from the link or the sender's own endpoint, and
// events go only to the sender's own beacon.
import { decodeRaw, encodeConfig, normalizeConfig, normalizeShipments, PALETTES, onColor, resolveState, safeUrl, type Shipment, type Status, type TrackerConfig } from './config'
import { pickLang, words } from './i18n'
import { linkParams, normalizePage, outgoing, shipmentFromLink, type PageConfig } from './page-config'
import { pageWords } from './page-i18n'
import { resolvePlace } from './routes'

const params = linkParams(location.search, location.hash)
const app = document.getElementById('app')!
let raw: Record<string, unknown> = decodeRaw(params.b)
let cfg: TrackerConfig, page: PageConfig, lang: string, t: ReturnType<typeof words>, w: ReturnType<typeof pageWords>
const linkHosts = new Set<string>()

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, string> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) e.setAttribute(k, v)
  for (const k of kids) if (k) e.append(k)
  return e
}

function track(event: string, s: Shipment | null, extra: Record<string, string> = {}): void {
  const body = { event, id: s?.id, utm_campaign: params.utm_campaign ?? page.campaign, utm_source: params.utm_source, utm_content: params.utm_content, ...extra }
  document.dispatchEvent(new CustomEvent('tg-page', { detail: body }))
  ;(window as unknown as { dataLayer?: unknown[] }).dataLayer?.push({ ...body, event: `tracking_${event}` })
  try { if (parent !== window) parent.postMessage({ source: 'tracking-globe', type: event, ...body }, '*') } catch { /* sandboxed */ }
  // text/plain: no preflight, so the sender's endpoint only needs to accept a POST.
  if (page.beacon) navigator.sendBeacon?.(page.beacon, new Blob([JSON.stringify(body)], { type: 'text/plain' }))
}

function link(url: string, label: string, cls: string, s: Shipment | null, status: string, name: string): HTMLAnchorElement {
  const href = outgoing(url, { id: s?.id, status }, params, page, name)
  try { linkHosts.add(new URL(href).hostname) } catch { /* kept as given */ }
  const a = el('a', { href, class: cls, rel: 'noopener' }, label)
  a.addEventListener('click', () => track('click', s, { target: name }))
  return a
}

function applyBrand(): void {
  const th = cfg.theme
  const dark = th.preset === 'dark' || (th.preset === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
  const base = PALETTES[dark ? 'dark' : 'light']
  const s = document.documentElement.style
  const accent = th.accent ?? base.accent; s.setProperty('--a', accent); s.setProperty('--on', onColor(accent)); s.setProperty('--wn', base.warn); s.setProperty('--bg', th.background ?? base.bg); s.setProperty('--tx', th.text ?? base.text); s.setProperty('--pn', th.panel ?? base.panel); s.setProperty('--r', `${th.radius}px`)
  if (th.font) s.setProperty('--f', th.font)
  if (page.fontUrl && 'FontFace' in window) {
    void new FontFace('TrackBrand', `url("${encodeURI(page.fontUrl)}")`).load().then(f => { document.fonts.add(f); s.setProperty('--f', `TrackBrand,${th.font ?? 'system-ui,sans-serif'}`) }).catch(() => undefined)
  }
  document.documentElement.lang = lang
}

function header(): HTMLElement {
  const logo = safeUrl(cfg.logo)
  const inner = page.siteUrl ? link(page.siteUrl, '', 'brand', null, '', 'logo') : el('div', { class: 'brand' })
  if (logo) inner.append(el('img', { src: logo, alt: cfg.title ?? '', referrerpolicy: 'no-referrer' }))
  else if (cfg.title) inner.append(el('b', {}, cfg.title))
  return el('header', {}, inner, page.tagline ? el('p', { class: 'tag' }, page.tagline) : null)
}

function stepper(status: Status): HTMLElement {
  const order: Status[] = ['pending', 'transit', 'delivered']
  const at = status === 'delayed' ? 1 : order.indexOf(status)
  return el('ol', { class: 'steps' }, ...order.map((st, i) => el('li', { class: i < at ? 'on' : i === at ? `on cur${status === 'delayed' ? ' late' : ''}` : '', ...(i === at ? { 'aria-current': 'step' } : {}) }, i === at ? t[status] : t[st])))
}

function date(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return isNaN(+d) ? iso : d.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' })
}

let viewed = false
function render(s: Shipment | null, notice?: string): void {
  app.textContent = ''
  linkHosts.clear()
  app.append(header())
  if (params.sample) app.append(el('p', { class: 'sample' }, w.sample))
  if (!s) {
    app.append(el('section', { class: 'card' }, el('p', {}, w.notFound), cfg.lookup ? searchForm() : null))
    app.append(footer()); return
  }
  const { status, progress } = resolveState(s, Date.now()), msg = page.messages[status]
  document.title = `${cfg.title ? `${cfg.title} · ` : ''}${s.id}`
  const a = resolvePlace(s.from)?.name, b = resolvePlace(s.to)?.name
  const main = msg?.cta ?? page.cta
  app.append(el('section', { class: 'card' },
    el('h1', {}, msg?.headline ?? t[status]),
    el('p', { class: 'meta' }, `${w.ref}: `, el('b', {}, s.id), s.label ? ` · ${s.label}` : ''),
    a && b ? el('p', { class: 'meta' }, `${a} → ${b} · ${t[s.mode]}`) : null,
    stepper(status),
    el('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': String(Math.round(progress * 100)), 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-label': t[status] }, el('i', { style: `width:${Math.round(progress * 100)}%` })),
    s.eta && status !== 'delivered' ? el('p', { class: 'eta' }, `${t.eta}: `, el('b', {}, date(s.eta))) : null,
    msg?.body ? el('p', {}, msg.body) : null,
    s.note ? el('p', { class: 'meta' }, s.note) : null,
    main ? link(main.url, main.label, 'btn', s, status, `cta_${status}`) : null,
    notice ? el('p', { class: 'meta' }, notice) : null,
  ))
  if (a && b) app.append(map(s))
  if (s.events?.length) app.append(el('section', { class: 'card' }, el('h2', {}, w.timeline), el('ul', { class: 'tl' }, ...s.events.map(ev => el('li', {}, el('b', {}, ev.label), el('span', {}, [date(ev.at), ev.place].filter(Boolean).join(' · ')))))))
  if (status === 'delivered' && page.reviewUrl) {
    const stars = el('div', { class: 'stars' })
    for (let n = 1; n <= 5; n++) {
      const star = link(`${page.reviewUrl}${page.reviewUrl.includes('?') ? '&' : '?'}rating=${n}`, '★', '', s, status, `review_${n}`)
      star.setAttribute('aria-label', `${n}/5`); stars.append(star)
    }
    app.append(el('section', { class: 'card' }, el('h2', {}, w.rate), stars))
  }
  if (page.promoCode) {
    const copy = el('button', { type: 'button', class: 'copy' }, w.copy)
    copy.onclick = async () => { try { await navigator.clipboard.writeText(page.promoCode!) } catch { /* the code stays on screen */ } copy.textContent = w.copied; track('promo_copy', s) }
    app.append(el('section', { class: 'card promo' }, el('div', {}, page.promoLabel ? el('p', {}, page.promoLabel) : null, el('code', {}, page.promoCode)), copy))
  }
  if (page.products.length) {
    app.append(el('section', {}, el('h2', {}, w.more), el('div', { class: 'prods' }, ...page.products.map((p, i) => {
      const card = link(p.url, '', 'prod', s, status, `product_${i + 1}`)
      if (p.image) card.append(el('img', { src: p.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }))
      card.append(el('b', {}, p.title)); if (p.price) card.append(el('span', {}, p.price))
      return card
    }))))
  }
  if (page.supportUrl || page.supportEmail) {
    const contact = page.supportUrl ? link(page.supportUrl, w.contact, 'ghost', s, status, 'support') : el('a', { class: 'ghost', href: `mailto:${page.supportEmail}?subject=${encodeURIComponent(s.id)}` }, w.contact)
    app.append(el('section', { class: 'card help' }, el('h2', {}, w.help), contact))
  }
  app.append(footer())
  if (!viewed) { viewed = true; track('view', s, { status }) }
}

function map(s: Shipment): HTMLElement {
  const conf = normalizeConfig({ ...raw, shipments: [s], simulate: false, autoRotate: false, height: 340, lazy: 'visible', lang, controls: { drag: true, zoom: true, viewSwitch: true, list: false, search: false, legend: false, fullscreen: true } })
  const g = document.createElement('tracking-globe')
  g.setAttribute('config', encodeConfig(conf)); g.setAttribute('style', 'display:block;height:340px')
  g.addEventListener('tg-ready', () => (g as unknown as { select(id: string): void }).select(s.id), { once: true })
  let told = false
  g.addEventListener('pointerdown', () => { if (!told) { told = true; track('map', s) } })
  return g
}

function searchForm(): HTMLElement {
  const i = el('input', { type: 'search', 'aria-label': w.ask, placeholder: w.ask })
  const f = el('form', { class: 'find' }, i, el('button', { class: 'btn', type: 'submit', 'aria-label': w.ask }, '→'))
  f.onsubmit = e => { e.preventDefault(); if (i.value.trim()) void lookup(i.value.trim()) }
  return f
}

function footer(): HTMLElement {
  const hosts = [...linkHosts]
  return el('footer', {},
    hosts.length ? el('p', {}, `${w.linksGo}: ${hosts.join(', ')}`) : null,
    location.hostname.endsWith('ifcvieweronline.eu') ? el('p', {}, w.notVerified) : null,
    page.privacyUrl ? el('p', {}, el('a', { href: page.privacyUrl, rel: 'noopener' }, w.privacy)) : null,
    el('p', {}, el('a', { href: 'https://www.ifcvieweronline.eu/tracking-globe/', rel: 'noopener' }, 'IFC Viewer Online')),
  )
}

async function lookup(id: string, fallback: Shipment | null = null): Promise<void> {
  try {
    const r = await fetch(cfg.lookup!.replace('{id}', encodeURIComponent(id)), { credentials: 'omit' })
    if (!r.ok) throw new Error(String(r.status))
    const body = await r.json()
    const got = normalizeShipments(Array.isArray(body) || body?.shipments ? body : [body])
    if (!got.length) throw new Error('empty')
    render(got[0])
  } catch { render(fallback, fallback ? w.stale : undefined) }
}

async function start(): Promise<void> {
  // A kit on the sender's own server: shorter links, and it can change after sending.
  const kit = safeUrl(params.k)
  if (kit) { try { const r = await fetch(kit, { credentials: 'omit' }); if (r.ok) raw = await r.json() } catch { /* falls back to any brand in the link */ } }
  cfg = normalizeConfig(raw); page = normalizePage(raw.page)
  lang = pickLang(params.lang ?? cfg.lang); t = words(lang); w = pageWords(lang)
  applyBrand()
  const fromLink = shipmentFromLink(params)
  if (params.id && cfg.lookup) { await lookup(params.id, fromLink); return }
  render(fromLink)
}
void start()
