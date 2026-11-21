// IFC Viewer Online: element quote list and browser-made downloads.
// Quote: the buyer picks elements in the 3D view, sets quantities, then either
// adds them to the cart as line items (current variant, element data in line
// item properties) or fills the theme's contact form. Downloads: a GLB and a
// CSV element list made in the visitor's browser from the IFC by the viewer.
// No server: Shopify's own cart and contact form do the rest.
// Talks to ifcvo.js only through window.IFCVO (viewer, open, subscribe).

const MAX_ITEMS = 50
const NOT_ELEMENTS = /^IFC(PROPERTY|QUANTITY|ELEMENTQUANTITY|MATERIAL|REL|OWNERHISTORY|PERSON|ORGANIZATION|APPLICATION|PROJECT$|OPENINGELEMENT|COMPLEXPROPERTY|.*TYPE$|.*STYLE$|.*PROFILE|.*CONTEXT|.*REPRESENTATION|.*UNIT)/i

// ── Pure helpers ─────────────────────────────────────────────────────────────

/** A quantity from user input: whole number, 1 to 9999. */
export function clampQty(v) {
  const n = Math.floor(Number(v))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 9999) : 1
}

/** Adds an element to the list, or one more of it if already there (same GlobalId, else same id). */
export function addItem(items, el) {
  const key = el.guid || `#${el.expressId}`
  const found = items.find((i) => (i.guid || `#${i.expressId}`) === key)
  if (found) return items.map((i) => (i === found ? { ...i, qty: clampQty(i.qty + 1) } : i))
  if (items.length >= MAX_ITEMS) return items
  return [...items, { guid: el.guid || '', expressId: el.expressId, name: el.name || '', ifcClass: el.ifcClass || '', qty: clampQty(el.qty || 1) }]
}

/** The /cart/add.js payload: one line per element, on the current variant. */
export function cartItems(variantId, items) {
  return {
    items: items.map((i) => ({
      id: Number(variantId),
      quantity: clampQty(i.qty),
      properties: {
        // Leading underscore: themes hide it from the buyer, the order keeps it.
        _ifc_guid: i.guid || `#${i.expressId}`,
        Element: (i.name || i.ifcClass || 'Element').slice(0, 250),
        'IFC class': i.ifcClass || '',
      },
    })),
  }
}

/** The contact form body: product, variant, then one line per element. */
export function quoteBody({ product = '', variant = '', url = '', intro = '' }, items) {
  const lines = []
  if (intro) lines.push(intro, '')
  lines.push(`Product: ${product}`)
  if (variant) lines.push(`Variant: ${variant}`)
  if (url) lines.push(`Page: ${url}`)
  lines.push('')
  for (const i of items) lines.push(`- ${clampQty(i.qty)} x ${i.name || i.ifcClass || 'Element'} (${i.ifcClass || 'IFC'}, GlobalId ${i.guid || '#' + i.expressId})`)
  return lines.join('\n')
}

/** One CSV cell: quoted, and never a formula when opened in a spreadsheet. */
export function csvCell(v) {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

/** findElements() results to a CSV element list (building elements only). */
export function elementsCsv(elements) {
  const rows = [['Name', 'GlobalId', 'IFC class', 'Type', 'Model']]
  for (const e of elements || []) {
    if (!e || !e.ifcClass || NOT_ELEMENTS.test(e.ifcClass)) continue
    rows.push([e.name, e.globalId, e.ifcClass, e.typeName, e.modelId])
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

// ── DOM ──────────────────────────────────────────────────────────────────────

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v)
    else node.setAttribute(k, v)
  }
  for (const c of children) if (c != null) node.append(c)
  return node
}

const viewerRoot = () => document.querySelector('[data-ifcvo-viewer]')

/** Tells ifcvo-events.js (bound to the viewer root) what happened here. */
function signal(type, detail) {
  const root = viewerRoot()
  if (root) root.dispatchEvent(new CustomEvent(type, { detail }))
}

function saveFile(blob, name) {
  const url = URL.createObjectURL(blob)
  const a = el('a', { href: url, download: name, style: 'display:none' })
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function currentVariant() {
  const input = document.querySelector('form[action*="/cart/add"] [name="id"]')
  const root = viewerRoot()
  return (input && input.value) || (root && root.dataset.variantId) || ''
}

function cartUrl() {
  const base = (window.Shopify && Shopify.routes && Shopify.routes.root) || '/'
  return base.replace(/\/?$/, '/') + 'cart/add.js'
}

/** The variant selected now (not at page render), by the cart form's id. "Default Title" means no variants. */
export function variantTitle(d) {
  let map = {}
  try { map = JSON.parse('{' + (d.variants || '') + '}') } catch (e) { /* bad map */ }
  const id = currentVariant()
  const t = (id && map[id]) || d.variant || ''
  return t === 'Default Title' ? '' : t
}

/** Mounts one quote list. `api` is window.IFCVO (or a stand-in in tests). */
export function mountQuote(root, api, fetchImpl = (...a) => fetch(...a)) {
  if (!root || root.dataset.ifcvoQuoteReady) return
  root.dataset.ifcvoQuoteReady = '1'
  const d = root.dataset
  const mode = d.mode === 'contact' ? 'contact' : 'cart'
  let items = []
  let picked = null

  const pick = el('button', { type: 'button', class: 'ifcvo-btn ifcvo-quote-pick', disabled: '' }, d.pickLabel || 'Add the selected element')
  const list = el('ul', { class: 'ifcvo-rows ifcvo-quote-list', 'aria-label': d.listLabel || 'Selected elements' })
  const action = el('button', { type: 'button', class: 'ifcvo-btn ifcvo-quote-go', 'data-ifcvo-quote': '', disabled: '' },
    mode === 'cart' ? d.cartLabel || 'Add to cart' : d.contactLabel || 'Request a quote')
  const status = el('p', { class: 'ifcvo-muted ifcvo-quote-status', role: 'status', 'aria-live': 'polite' })
  const say = (text, error = false) => { status.textContent = text || ''; status.classList.toggle('ifcvo-error', !!error) }

  const render = () => {
    list.replaceChildren()
    if (!items.length) list.append(el('li', { class: 'ifcvo-muted' }, d.empty || 'No elements yet. Select one in the 3D view.'))
    items.forEach((it, idx) => {
      const label = it.name || it.ifcClass || 'Element'
      const qty = el('input', { type: 'number', min: '1', max: '9999', step: '1', value: String(it.qty), class: 'ifcvo-qty', 'aria-label': `${d.qtyLabel || 'Quantity'}: ${label}` })
      qty.addEventListener('change', () => { items = items.map((x, j) => (j === idx ? { ...x, qty: clampQty(qty.value) } : x)); qty.value = String(items[idx].qty) })
      list.append(el('li', { class: 'ifcvo-quote-row' },
        el('span', { class: 'ifcvo-name' }, label),
        el('span', { class: 'ifcvo-muted' }, ` ${it.ifcClass}${it.guid ? ' · ' + it.guid : ''} `),
        qty,
        el('button', { type: 'button', class: 'ifcvo-chip', 'aria-label': `${d.removeLabel || 'Remove'}: ${label}`,
          onclick: () => { items = items.filter((_, j) => j !== idx); render(); pick.focus() } }, d.removeLabel || 'Remove')))
    })
    if (items.length) action.removeAttribute('disabled')
    else action.setAttribute('disabled', '')
  }

  pick.addEventListener('click', () => {
    if (!picked) return
    const before = items.length
    items = addItem(items, picked)
    if (items.length === before && before >= MAX_ITEMS) say(d.full || `Up to ${MAX_ITEMS} elements.`, true)
    else say('')
    render()
  })

  action.addEventListener('click', async () => {
    if (!items.length) return
    signal('ifcvo:quote', {})
    if (mode === 'contact') {
      const form = document.querySelector(d.form || 'form[action*="/contact"]')
      const body = form && form.querySelector('[name="contact[body]"]')
      if (!body) { say(d.noForm || 'There is no contact form on this page.', true); return }
      body.value = quoteBody({ product: d.product, variant: variantTitle(d),  url: location.href.split('#')[0], intro: d.intro }, items)
      body.dispatchEvent(new Event('input', { bubbles: true }))
      try { body.scrollIntoView({ block: 'center' }) } catch (e) { /* old browser */ }
      body.focus()
      say(d.filled || 'The contact form below has the list. Add your details and send it.')
      return
    }
    const variant = currentVariant()
    if (!variant) { say(d.error || 'Could not add to the cart.', true); return }
    action.setAttribute('disabled', '')
    try {
      const res = await fetchImpl(cartUrl(), {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(cartItems(variant, items)),
      })
      if (!res.ok) {
        let msg = ''
        try { const j = await res.json(); msg = j && (j.description || j.message) || '' } catch (e) { /* not JSON */ }
        throw new Error(msg)
      }
      const n = items.length
      items = []
      render()
      say((d.added || 'Added to the cart: {n}').replace('{n}', String(n)))
      document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }))
    } catch (e) {
      say((d.error || 'Could not add to the cart.') + (e && e.message ? ' ' + e.message : ''), true)
      render()
    }
  })

  const body = root.querySelector('.ifcvo-quote-body') || root
  body.append(pick, list, action, status)
  render()

  api.subscribe(root, (type, e) => {
    if (type === 'model-loaded') { picked = null; pick.setAttribute('disabled', '') }
    if (type !== 'element-selected' || !e) return
    if (e.expressId == null) { picked = null; pick.setAttribute('disabled', ''); return }
    picked = { guid: e.globalId || '', expressId: e.expressId, name: e.name || '', ifcClass: e.ifcType || '' }
    pick.removeAttribute('disabled')
    pick.textContent = `${d.pickLabel || 'Add the selected element'}: ${picked.name || picked.ifcClass || '#' + picked.expressId}`
  })
}

/** Wires the GLB / CSV buttons of one downloads list. */
export function mountDownloads(box, api) {
  if (!box || box.dataset.ifcvoMakeReady) return
  box.dataset.ifcvoMakeReady = '1'
  let loaded = !!api.viewer
  let waiters = []
  api.subscribe(box, (type) => { if (type === 'model-loaded') { loaded = true; waiters.forEach((w) => w()); waiters = [] } })
  const status = box.querySelector('.ifcvo-make-status')
  const say = (t, err = false) => { if (status) { status.textContent = t || ''; status.classList.toggle('ifcvo-error', !!err) } }
  const whenLoaded = () => (loaded ? Promise.resolve() : new Promise((res, rej) => {
    waiters.push(res)
    setTimeout(() => rej(new Error('timeout')), 120000)
  }))

  for (const btn of box.querySelectorAll('[data-ifcvo-make]')) {
    btn.addEventListener('click', async () => {
      // Preview mode of the "IFC plan view" block: no browser-made files.
      if (document.querySelector('[data-ifcvo-protect]')) return
      const kind = btn.dataset.ifcvoMake
      btn.setAttribute('disabled', '')
      btn.setAttribute('aria-busy', 'true')
      say(box.dataset.making || 'Preparing the file in your browser…')
      try {
        const v = api.viewer || await api.open()
        if (!v) throw new Error(box.dataset.noViewer || 'The 3D viewer is not available on this device.')
        await whenLoaded()
        const base = (viewerRoot()?.dataset.model || 'model').split(/[?#]/)[0].split('/').pop().replace(/\.[^.]+$/, '') || 'model'
        if (kind === 'glb') {
          if (typeof v.exportModel !== 'function') throw new Error(box.dataset.noGlb || 'GLB export needs a newer viewer version.')
          const f = await v.exportModel({ format: 'glb' })
          saveFile(new Blob([f.bytes], { type: f.mimeType || 'model/gltf-binary' }), f.fileName || base + '.glb')
          signal('ifcvo:download', { file: f.fileName || base + '.glb' })
        } else {
          const list = await v.findElements({ limit: 20000 })
          saveFile(new Blob([elementsCsv(list)], { type: 'text/csv;charset=utf-8' }), base + '-elements.csv')
          signal('ifcvo:download', { file: base + '-elements.csv' })
        }
        say(box.dataset.made || 'Done.')
      } catch (e) {
        say((box.dataset.makeError || 'Could not prepare the file.') + (e && e.message && e.message !== 'timeout' ? ' ' + e.message : ''), true)
      } finally {
        btn.removeAttribute('disabled')
        btn.removeAttribute('aria-busy')
      }
    })
  }
}

/** IFC and extra-file links outside the viewer root (the IFC downloads block) count as downloads too. */
export function onDownloadClick(ev) {
  const a = ev.target && ev.target.closest ? ev.target.closest('[data-ifcvo-downloads] a[download]') : null
  if (!a || a.closest('[data-ifcvo-viewer]')) return
  const file = a.dataset.file || (a.getAttribute('href') || '').split(/[?#]/)[0].split('/').pop()
  signal('ifcvo:download', { file })
}

export function initAll(api = typeof window !== 'undefined' ? window.IFCVO : null) {
  if (!api) return
  for (const r of document.querySelectorAll('[data-ifcvo-quote-list]')) mountQuote(r, api)
  for (const b of document.querySelectorAll('[data-ifcvo-downloads]')) if (b.querySelector('[data-ifcvo-make]')) mountDownloads(b, api)
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (window.IFCVO) initAll()
  else document.addEventListener('ifcvo:ready', () => initAll(), { once: true })
  document.addEventListener('shopify:section:load', () => initAll())
  if (!window.__ifcvoDlClicks) { window.__ifcvoDlClicks = true; document.addEventListener('click', onDownloadClick) }
}
