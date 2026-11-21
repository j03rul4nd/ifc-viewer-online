// "View in your space" block: augmented reality of the product, no server.
// Source, in order: the merchant's files (USDZ / GLB metafields or the product's
// Shopify 3D model), then a model made from the IFC in the visitor's browser.
//  - iPhone / iPad: Quick Look via a real `<a rel="ar">` the visitor taps (a made USDZ is a blob: URL,
//    made ahead when the viewer has the model, or on a first tap that then turns the button into the link).
//  - Android: Scene Viewer, which downloads the GLB itself, so it needs a
//    public https file: the merchant's GLB or the Shopify 3D model. A GLB made
//    in the browser has no such URL, so then the block says so (no remote
//    scripts are loaded to work around it).
//  - Desktop: a QR code of the product page (encoded here, no QR service).
// Made models over the size limit are refused on phones with a clear message.

export const LABELS = {
  button: 'View in your space',
  making: 'Preparing the AR model on your device…',
  error: 'The AR model could not be prepared.',
  too_large: 'This model is too large for AR on a phone ({size} MB).',
  scan: 'Scan with your phone to see it in your space',
  no_ar: 'This device cannot show AR.',
  hosted: 'AR on Android needs a 3D file hosted by the shop. Open this page on an iPhone, or ask the shop for the AR file.',
  no_viewer: 'The 3D viewer is not available on this device.',
}

const MB = 1024 * 1024

function readJson(text) {
  try { const v = JSON.parse(text || 'null'); return v && typeof v === 'object' ? v : null } catch (e) { return null }
}

export function parseLabels(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && v) out[k] = v }
  }
  return out
}

function labelsFor(all, locale) {
  if (!all) return {}
  const lang = String(locale || '').toLowerCase()
  return { ...(all.en || {}), ...(all[lang.split('-')[0]] || {}), ...(all[lang] || {}) }
}

/** Defaults ← theme locale (Liquid `t`) ← shop ifcvo.labels (key `ar`) ← block textarea. */
export function labelsOf(root) {
  const merged = { ...LABELS }
  const shop = labelsFor(readJson(root.dataset.ifcvoLabels), root.dataset.locale)
  const layers = [readJson(root.dataset.labels), shop && typeof shop.ar === 'object' ? shop.ar : null, parseLabels(root.dataset.labelsOverride)]
  for (const layer of layers) for (const [k, v] of Object.entries(layer || {})) {
    if (k in LABELS && typeof v === 'string' && v && !/^translation missing/i.test(v)) merged[k] = v
  }
  return merged
}

/** 'ios' | 'android' | 'desktop' from the user agent and touch points (iPadOS reports a Mac). */
export function platform(ua = '', maxTouchPoints = 0) {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
}

/** Only https (or same-page relative) URLs leave this module; anything else is dropped. */
export function safeUrl(u) {
  const s = String(u || '').trim()
  if (!s) return ''
  if (s.startsWith('//')) return 'https:' + s
  return /^https:\/\//i.test(s) ? s : ''
}

/** Scene Viewer intent for a public https GLB, with the product page as the fallback. */
export function sceneViewerUrl(glb, title, fallback) {
  const q = `file=${encodeURIComponent(glb)}&mode=ar_preferred${title ? '&title=' + encodeURIComponent(title) : ''}`
  return `intent://arvr.google.com/scene-viewer/1.2?${q}#Intent;scheme=https;package=com.google.ar.core;action=android.intent.action.VIEW;` +
    (fallback ? `S.browser_fallback_url=${encodeURIComponent(fallback)};` : '') + 'end;'
}

/**
 * What the button does on this device. `files` = { glb, usdz } (https or empty),
 * `generate` = the page has an IFC viewer that can make the model.
 * Returns { kind: 'quicklook', href } | { kind: 'quicklook-make' } |
 * { kind: 'sceneviewer', href } | { kind: 'hosted' } | { kind: 'qr' } | { kind: 'none' }.
 */
export function plan(device, files, generate, opts = {}) {
  const glb = safeUrl(files.glb)
  const usdz = safeUrl(files.usdz)
  if (device === 'ios') {
    if (opts.quickLook === false) return { kind: 'none' }
    if (usdz) return { kind: 'quicklook', href: usdz }
    return generate ? { kind: 'quicklook-make' } : { kind: 'none' }
  }
  if (device === 'android') {
    if (glb) return { kind: 'sceneviewer', href: sceneViewerUrl(glb, opts.title, opts.page) }
    return generate ? { kind: 'hosted' } : { kind: 'none' }
  }
  return glb || usdz || generate ? { kind: 'qr' } : { kind: 'none' }
}

/** Refuse made models over the limit on phones. Returns null or the message. */
export function sizeCheck(bytes, limitMb, labels, device) {
  if (device === 'desktop' || !limitMb || bytes <= limitMb * MB) return null
  return labels.too_large.replace('{size}', String(Math.round(bytes / MB)))
}

// ─── QR code (byte mode, error correction M, versions 1–20) ────────────────────
// After Project Nayuki's reference algorithm (MIT): data codewords, Reed–Solomon
// blocks, function patterns, the 8 masks scored by the standard penalty rules.

const ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26]
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16]

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36 }
  return r
}
function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_M[ver] * BLOCKS_M[ver] }

function rsMul(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x }
  return z & 0xff
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = rsMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1] }
    root = rsMul(root, 0x02)
  }
  return r
}
function rsRemainder(data, div) {
  const r = div.map(() => 0)
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0)
    div.forEach((c, i) => { r[i] ^= rsMul(c, f) })
  }
  return r
}

function alignPositions(ver) {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let p = ver * 4 + 10; out.length < n; p -= step) out.splice(1, 0, p)
  return out
}

/** Module matrix (true = dark) for `text`, or null when it does not fit version 20. `mask` 0–7 forces one (tests). */
export function qrMatrix(text, mask) {
  const bytes = Array.from(new TextEncoder().encode(String(text)))
  let ver = 1
  for (; ver <= 20; ver++) {
    const bits = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8
    if (bits <= dataCodewords(ver) * 8) break
  }
  if (ver > 20) return null
  // Data bits.
  const bb = []
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bb.push((v >>> i) & 1) }
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); for (const b of bytes) put(b, 8)
  const cap = dataCodewords(ver) * 8
  put(0, Math.min(4, cap - bb.length)); put(0, (8 - (bb.length % 8)) % 8)
  for (let pad = 0xec; bb.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data = []
  for (let i = 0; i < bb.length; i += 8) data.push(bb.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  // Blocks + interleave.
  const nb = BLOCKS_M[ver]; const ecl = ECC_M[ver]; const raw = Math.floor(rawModules(ver) / 8)
  const shortLen = Math.floor(raw / nb); const nShort = nb - (raw % nb)
  const div = rsDivisor(ecl); const blocks = []
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecl + (i < nShort ? 0 : 1)); k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < nShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const words = []
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecl || j >= nShort) words.push(b[i]) })

  const size = ver * 4 + 17
  const mod = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true }
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  const finder = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)); const xx = x + dx; const yy = y + dy
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4)
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  const al = alignPositions(ver)
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }
  const format = (mask) => {
    const d = (0 << 3) | mask // M = 0b00
    let r = d
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537)
    const bits = ((d << 10) | r) ^ 0x5412
    const b = (i) => ((bits >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) set(8, i, b(i))
    set(8, 7, b(6)); set(8, 8, b(7)); set(7, 8, b(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, b(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, b(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, b(i))
    set(8, size - 8, true)
  }
  format(0)
  if (ver >= 7) {
    let r = ver
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25)
    const bits = (ver << 12) | r
    for (let i = 0; i < 18; i++) {
      const d = ((bits >>> i) & 1) !== 0; const a = size - 11 + (i % 3); const b = Math.floor(i / 3)
      set(a, b, d); set(b, a, d)
    }
  }
  // Codewords in the zigzag.
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j; const up = ((right + 1) & 2) === 0; const y = up ? size - 1 - vert : vert
      if (!fn[y][x] && i < words.length * 8) { mod[y][x] = ((words[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++ }
    }
  }
  const masks = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ]
  const apply = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && masks[m](x, y)) mod[y][x] = !mod[y][x] }
  let best = 0; let bestScore = Infinity
  for (let m = 0; m < 8; m++) {
    if (mask >= 0 && mask < 8 && m !== mask) continue
    apply(m); format(m)
    const s = penalty(mod)
    if (s < bestScore) { best = m; bestScore = s }
    apply(m)
  }
  apply(best); format(best)
  return mod
}

/** Standard QR penalty score (rules N1–N4). */
export function penalty(mod) {
  const size = mod.length
  let score = 0
  const finderLike = (h) => {
    const n = h[1]
    const core = n > 0 && h[2] === n && h[3] === n * 3 && h[4] === n && h[5] === n
    return (core && h[0] >= n * 4 && h[6] >= n ? 1 : 0) + (core && h[6] >= n * 4 && h[0] >= n ? 1 : 0)
  }
  const line = (get) => {
    let color = false; let run = 0; const h = [0, 0, 0, 0, 0, 0, 0]
    const push = (len) => { if (h[0] === 0) len += size; h.pop(); h.unshift(len) }
    for (let k = 0; k < size; k++) {
      if (get(k) === color) { run++; if (run === 5) score += 3; else if (run > 5) score++ }
      else {
        // Run ends: record it; a light run that closes a dark–light pattern is checked.
        push(run); if (!color) score += finderLike(h) * 40
        color = get(k); run = 1
      }
    }
    // Close the line as if it continued in light.
    if (color) { push(run); run = 0 }
    run += size; push(run)
    score += finderLike(h) * 40
  }
  for (let y = 0; y < size; y++) line((x) => mod[y][x])
  for (let x = 0; x < size; x++) line((y) => mod[y][x])
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = mod[y][x]
    if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) score += 3
  }
  let dark = 0
  for (const r of mod) for (const c of r) if (c) dark++
  const total = size * size
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
  return score + k * 10
}

/** The matrix as an SVG string (4-module quiet zone, crisp edges). */
export function qrSvg(matrix, label = '') {
  const n = matrix.length + 8
  let d = ''
  matrix.forEach((row, y) => row.forEach((c, x) => { if (c) d += `M${x + 4} ${y + 4}h1v1h-1z` }))
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`
}

// ─── DOM ───────────────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  for (const c of kids) if (c !== null && c !== undefined) n.append(c)
  return n
}

function quickLookSupported() {
  try { return document.createElement('a').relList.supports('ar') } catch (e) { return false }
}

/**
 * A real Quick Look link: `<a rel="ar">` whose first child is an `<img>` (Safari
 * requires both). The visitor taps it, so the tap is the user activation Quick
 * Look needs; it is never clicked from script after an await.
 */
export function arLink(href, label) {
  return el('a', { rel: 'ar', href, class: 'ifcvo-btn ifcvo-ar-btn' },
    el('img', { alt: '', width: '1', height: '1', src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=' }), label)
}

const objectUrls = new Map()

/** Wires one "View in your space" block. */
export function mount(root, api = typeof window !== 'undefined' ? window.IFCVO : null, env = {}) {
  if (!root || root.dataset.ifcvoArReady) return
  root.dataset.ifcvoArReady = '1'
  if (api && typeof api.gate === 'function' && !api.gate('ar', root.querySelector('[data-ifcvo-ar-body]'))) return
  const labels = labelsOf(root)
  const device = env.device || platform(navigator.userAgent, navigator.maxTouchPoints || 0)
  const generate = root.dataset.generate === 'true' && !!document.querySelector('[data-ifcvo-viewer]')
  const files = { glb: root.dataset.glb, usdz: root.dataset.usdz }
  const page = safeUrl(root.dataset.page) || (typeof location !== 'undefined' ? location.href.split('#')[0] : '')
  const ql = env.quickLook !== undefined ? env.quickLook : quickLookSupported()
  const p = plan(device, files, generate, { title: root.dataset.title, page, quickLook: device === 'ios' ? ql : undefined })
  const body = root.querySelector('[data-ifcvo-ar-body]') || root
  const status = el('p', { class: 'ifcvo-muted', role: 'status', 'aria-live': 'polite' })
  const limit = Number(root.dataset.limitMb) || 50
  root.dataset.ifcvoArKind = p.kind

  if (p.kind === 'none') { body.replaceChildren(el('p', { class: 'ifcvo-muted' }, labels.no_ar)); return }
  if (p.kind === 'qr') {
    const m = qrMatrix(page)
    const fig = el('figure', { class: 'ifcvo-ar-qr' })
    if (m) fig.innerHTML = qrSvg(m, labels.scan)
    fig.append(el('figcaption', {}, labels.scan))
    body.replaceChildren(fig)
    return
  }
  if (p.kind === 'hosted') { body.replaceChildren(el('p', { class: 'ifcvo-muted' }, labels.hosted)); return }

  if (p.kind === 'quicklook') { body.replaceChildren(arLink(p.href, labels.button)); return }
  const btn = el('button', { type: 'button', class: 'ifcvo-btn ifcvo-ar-btn' }, labels.button)
  body.replaceChildren(btn, status)
  if (p.kind === 'sceneviewer') {
    btn.addEventListener('click', () => { (env.navigate || ((u) => { location.href = u }))(p.href) })
    return
  }
  // quicklook-make: a USDZ made from the IFC on this phone. States (data-ifcvo-ar-state):
  // idle -> making -> ready (the button becomes a real <a rel="ar"> the visitor taps) | error (tap retries).
  const setState = (st) => { root.dataset.ifcvoArState = st }
  setState('idle')
  const ready = (url) => {
    setState('ready')
    status.classList.remove('ifcvo-error')
    status.textContent = ''
    body.replaceChildren(arLink(url, labels.button), status)
  }
  let job = null
  const make = () => {
    if (job) return job
    const cached = objectUrls.get(root)
    if (cached) { ready(cached); return Promise.resolve() }
    setState('making')
    btn.setAttribute('disabled', ''); btn.setAttribute('aria-busy', 'true')
    status.classList.remove('ifcvo-error')
    status.textContent = labels.making
    job = (async () => {
      try {
        const v = (api && api.viewer) || (api && typeof api.open === 'function' && await api.open())
        if (!v) throw new Error(labels.no_viewer)
        if (typeof v.exportModel !== 'function') throw new Error(labels.error)
        const f = await v.exportModel({ format: 'usdz', ar: true, maxTriangles: Number(root.dataset.maxTriangles) || undefined, includeSite: root.dataset.includeSite === 'true' })
        const tooBig = sizeCheck(f.sizeBytes || (f.bytes && f.bytes.byteLength) || 0, limit, labels, device)
        if (tooBig) throw Object.assign(new Error(tooBig), { plain: true })
        const url = URL.createObjectURL(new Blob([f.bytes], { type: 'model/vnd.usdz+zip' }))
        objectUrls.set(root, url)
        ready(url)
      } catch (e) {
        setState('error')
        status.classList.add('ifcvo-error')
        status.textContent = e && e.plain ? e.message : labels.error + (e && e.message && e.message !== labels.error ? ' ' + e.message : '')
      } finally {
        btn.removeAttribute('disabled'); btn.removeAttribute('aria-busy')
        job = null
      }
    })()
    return job
  }
  btn.addEventListener('click', () => { make() })
  // Pre-make once the page's viewer has the model, while the phone is idle, so the first tap opens AR.
  const idle = env.idle || ((fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500)))
  const soon = () => idle(() => { if (root.isConnected && root.dataset.ifcvoArState === 'idle') make() })
  if (api && typeof api.subscribe === 'function') api.subscribe(root, (type) => { if (type === 'model-loaded') soon() })
  if (api && api.viewer) soon()
  return { make }
}

export function initAll(api) {
  for (const r of document.querySelectorAll('[data-ifcvo-ar]')) mount(r, api)
}

export function destroy(container) {
  for (const [root, url] of objectUrls) if (container.contains(root)) { URL.revokeObjectURL(url); objectUrls.delete(root) }
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (window.IFCVO) initAll(window.IFCVO)
  else document.addEventListener('ifcvo:ready', () => initAll(window.IFCVO), { once: true })
  document.addEventListener('shopify:section:load', () => initAll(window.IFCVO))
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
}
