// Runtime shared by the IFC Viewer Online theme blocks. The "Product IFC model"
// block mounts the viewer through the SDK; the explorer, element details, views
// and Health Score blocks can sit anywhere else on the page and drive it.
// One page, one viewer: the companion blocks attach to the first one.
const SDK = 'https://www.ifcvieweronline.eu/sdk/1.18.0/ifc-viewer.es.js'

const listeners = new Set()
let viewer = null
let opener = null

/** Customer events, so the merchant's analytics pixels can count use. */
function track(name, data) {
  try { window.Shopify && Shopify.analytics && Shopify.analytics.publish(name, data) } catch (e) { /* no pixels */ }
}

function emit(type, detail) {
  for (const cb of listeners) cb(type, detail)
}

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

const NAMES = {
  WALLSTANDARDCASE: 'Wall', CURTAINWALL: 'Curtain wall', BUILDINGELEMENTPROXY: 'Building element proxy',
  BUILDINGSTOREY: 'Storey', STAIRFLIGHT: 'Stair flight', FURNISHINGELEMENT: 'Furniture', FLOWTERMINAL: 'Flow terminal',
  FLOWSEGMENT: 'Flow segment', FLOWFITTING: 'Flow fitting', FLOWCONTROLLER: 'Flow controller', DISTRIBUTIONELEMENT: 'Distribution element',
  SLABSTANDARDCASE: 'Slab', BEAMSTANDARDCASE: 'Beam', COLUMNSTANDARDCASE: 'Column', MEMBERSTANDARDCASE: 'Member',
  PLATESTANDARDCASE: 'Plate', DOORSTANDARDCASE: 'Door', WINDOWSTANDARDCASE: 'Window', SANITARYTERMINAL: 'Sanitary terminal',
  ELEMENTASSEMBLY: 'Element assembly', ELECTRICAPPLIANCE: 'Electric appliance', LIGHTFIXTURE: 'Light fixture',
  AUDIOVISUALAPPLIANCE: 'Audiovisual appliance', SHADINGDEVICE: 'Shading device', TRANSPORTELEMENT: 'Transport element',
  CIVILELEMENT: 'Civil element', GEOGRAPHICELEMENT: 'Geographic element', SWITCHINGDEVICE: 'Switching device',
  PROTECTIVEDEVICE: 'Protective device', CABLESEGMENT: 'Cable segment', CABLECARRIERSEGMENT: 'Cable tray',
  DUCTSEGMENT: 'Duct segment', PIPESEGMENT: 'Pipe segment', DISTRIBUTIONCONTROLELEMENT: 'Control element',
}
/** `IFCCURTAINWALL` → `Curtain wall`. */
function className(ifcClass) {
  const raw = String(ifcClass || 'Element').replace(/^IFC/i, '').toUpperCase()
  if (NAMES[raw]) return NAMES[raw]
  const s = raw.toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// findElements() lists every entity with a name; the explorer shows only the
// building's elements and spaces, not property sets, materials or types.
const NOT_ELEMENTS = /^IFC(PROPERTY|QUANTITY|ELEMENTQUANTITY|MATERIAL|REL|OWNERHISTORY|PERSON|ORGANIZATION|APPLICATION|PROJECT$|OPENINGELEMENT|COMPLEXPROPERTY|.*TYPE$|.*STYLE$|.*PROFILE|.*CONTEXT|.*REPRESENTATION|.*UNIT)/i

function background(root) {
  const d = root.dataset
  if (d.bg === 'brand') return { top: d.bgTop || '#ffffff', bottom: d.bgBottom || d.bgTop || '#ffffff' }
  return d.bg || undefined
}

// ── Viewer ───────────────────────────────────────────────────────────────────

async function mountViewer(root) {
  const stage = root.querySelector('.ifcvo-stage')
  const link = root.querySelector('.ifcvo-download')
  const models = JSON.parse('{' + (root.dataset.models || '') + '}')
  let model = root.dataset.model

  const open = async () => {
    if (viewer) return viewer
    const { IfcViewer } = await import(SDK)
    stage.replaceChildren()
    const d = root.dataset
    viewer = new IfcViewer(stage, {
      model,
      ui: d.ui,
      view: d.view,
      validate: d.validate !== '0',
      lang: d.lang || undefined,
      accent: d.accent || undefined,
      background: background(root),
      title: d.title,
      height: '100%',
    })
    for (const type of ['model-loaded', 'element-selected', 'validation-completed', 'tour-started', 'tour-step', 'tour-ended']) {
      viewer.on(type, (e) => emit(type, e))
    }
    track('ifc_viewer_opened', { model })
    emit('viewer', viewer)
    return viewer
  }
  opener = open

  root.querySelector('.ifcvo-open')?.addEventListener('click', open)
  if (root.dataset.load === 'visible' && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { io.disconnect(); open() }
    }, { rootMargin: '200px' })
    io.observe(root)
  }

  root.addEventListener('click', (e) => {
    const a = e.target.closest('a[download]')
    if (a) track('ifc_model_downloaded', { file: a.dataset.file || model })
  })

  // Themes update the cart form's variant id after the picker changes.
  document.addEventListener('change', () => {
    setTimeout(() => {
      const input = document.querySelector('form[action*="/cart/add"] [name="id"]')
      const url = input && models[input.value]
      if (!url || url === model) return
      model = url
      if (link) link.href = url
      if (viewer) { viewer.clear(); viewer.addFromUrl(url) }
    }, 0)
  })
}

// ── Companion blocks ─────────────────────────────────────────────────────────

/** Before the viewer opens, a companion block offers to open it. */
function waiting(body, label) {
  body.replaceChildren(el('button', { type: 'button', class: 'ifcvo-btn', onclick: () => opener && opener() }, label))
}

function explorer(root) {
  const body = root.querySelector('.ifcvo-body')
  const search = root.querySelector('.ifcvo-search')
  const max = Number(root.dataset.max || 200)
  let elements = []
  let selected = null
  let isolated = null

  const render = () => {
    const q = (search?.value || '').trim().toLowerCase()
    const groups = new Map()
    for (const e of elements) {
      if (q && !`${e.name || ''} ${e.typeName || ''} ${e.ifcClass || ''}`.toLowerCase().includes(q)) continue
      const key = e.ifcClass || 'IFCELEMENT'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(e)
    }
    const list = el('div', { class: 'ifcvo-groups' })
    for (const [cls, items] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
      const only = el('button', {
        type: 'button', class: 'ifcvo-chip' + (isolated === cls ? ' is-on' : ''), 'aria-pressed': String(isolated === cls),
        onclick: (ev) => { ev.preventDefault(); isolated = isolated === cls ? null : cls; isolated ? viewer.isolate(cls) : viewer.showAll(); render() },
      }, isolated === cls ? root.dataset.showAll : root.dataset.only)
      const rows = el('ul', { class: 'ifcvo-rows' })
      for (const e of items.slice(0, max)) {
        rows.append(el('li', {}, el('button', {
          type: 'button', class: 'ifcvo-row' + (selected === e.expressId ? ' is-on' : ''),
          onclick: () => { viewer.select(e.expressId, e.modelId); viewer.frame(e.expressId, e.modelId) },
        }, e.name || e.typeName || `#${e.expressId}`)))
      }
      if (items.length > max) rows.append(el('li', { class: 'ifcvo-more' }, `+${items.length - max}`))
      list.append(el('details', { class: 'ifcvo-group', ...(q || groups.size === 1 ? { open: '' } : {}) },
        el('summary', {}, el('span', { class: 'ifcvo-name' }, className(cls)), el('span', { class: 'ifcvo-count' }, String(items.length)), only),
        rows))
    }
    body.replaceChildren(list)
  }

  search?.addEventListener('input', render)
  waiting(body, root.dataset.openLabel)
  listeners.add(async (type, e) => {
    if (type === 'model-loaded') {
      // A new model (another variant) starts with nothing isolated or selected.
      isolated = null
      selected = null
      elements = (await viewer.findElements({ limit: 20000 })).filter((e) => e.ifcClass && !NOT_ELEMENTS.test(e.ifcClass))
      render()
    }
    if (type === 'element-selected') { selected = e.expressId; if (elements.length) render() }
  })
}

function details(root) {
  const body = root.querySelector('.ifcvo-body')
  const empty = root.dataset.empty
  waiting(body, root.dataset.openLabel)

  const table = (rows) => el('table', {}, ...rows.map(([k, v]) => el('tr', {}, el('th', { scope: 'row' }, k), el('td', {}, v ?? '—'))))
  listeners.add(async (type, e) => {
    if (type === 'model-loaded') body.replaceChildren(el('p', { class: 'ifcvo-muted' }, empty))
    if (type !== 'element-selected') return
    const data = await viewer.getElement(e.globalId || e.expressId, e.modelId || undefined)
    if (!data) return
    const sets = data.effectivePropertySets?.length ? data.effectivePropertySets : data.propertySets || []
    const parts = [
      el('p', { class: 'ifcvo-title' }, data.name || e.name || className(data.ifcClass)),
      table([['Class', className(data.ifcClass || e.ifcType)], ['Type', data.typeName], ['Storey', data.storey], ['Tag', data.tag]].filter(([, v]) => v)),
    ]
    sets.forEach((set, i) => parts.push(el('details', { class: 'ifcvo-group', ...(i === 0 ? { open: '' } : {}) },
      el('summary', {}, el('span', { class: 'ifcvo-name' }, set.name), el('span', { class: 'ifcvo-count' }, String(set.properties.length))),
      table(set.properties.map((p) => [p.name, p.value == null ? null : String(p.value)])))))
    for (const q of data.quantitySets || []) parts.push(el('details', { class: 'ifcvo-group' },
      el('summary', {}, el('span', { class: 'ifcvo-name' }, q.name), el('span', { class: 'ifcvo-count' }, String(q.quantities.length))),
      table(q.quantities.map((x) => [x.name, x.value == null ? null : `${Math.round(x.value * 1000) / 1000}${x.unit ? ' ' + x.unit : ''}`]))))
    body.replaceChildren(...parts)
    track('ifc_element_viewed', { ifcClass: data.ifcClass })
  })
}

function views(root) {
  const buttons = [...root.querySelectorAll('[data-view]')]
  const tour = root.querySelector('[data-tour]')
  const caption = root.querySelector('.ifcvo-caption')
  let touring = false
  for (const b of buttons) {
    b.addEventListener('click', async () => {
      const v = viewer || await opener?.()
      if (!v) return
      await v.whenReady()
      v.setView(b.dataset.view)
      buttons.forEach((x) => x.classList.toggle('is-on', x === b))
    })
  }
  tour?.addEventListener('click', async () => {
    const v = viewer || await opener?.()
    if (!v) return
    if (touring) { await v.stopTour(); return }
    await v.startTour(root.dataset.template || 'client-walkthrough', { autoplay: Number(root.dataset.pace || 6) * 1000 })
    track('ifc_tour_started', {})
  })
  listeners.add((type, e) => {
    if (type === 'tour-started') { touring = true; tour?.classList.add('is-on'); if (tour) tour.textContent = root.dataset.stop }
    if (type === 'tour-step' && caption) caption.textContent = e.caption ? `${e.index + 1}/${e.total} · ${e.caption}` : `${e.index + 1}/${e.total}`
    if (type === 'tour-ended') { touring = false; tour?.classList.remove('is-on'); if (tour) tour.textContent = root.dataset.play; if (caption) caption.textContent = '' }
  })
}

function score(root) {
  const body = root.querySelector('.ifcvo-body')
  const labels = JSON.parse(root.dataset.labels)
  waiting(body, root.dataset.openLabel)
  listeners.add((type, e) => {
    if (type !== 'validation-completed' || e.qualityScore == null) return
    const s = Math.round(e.qualityScore)
    const band = s >= 90 ? 'excellent' : s >= 75 ? 'good' : s >= 50 ? 'fair' : 'poor'
    body.replaceChildren(
      el('div', { class: 'ifcvo-score' },
        el('span', { class: 'ifcvo-score-num ifcvo-' + band }, String(s)),
        el('span', {}, el('strong', {}, labels[band]), el('br'), el('span', { class: 'ifcvo-muted' }, `${e.errors} ${labels.errors} · ${e.warnings} ${labels.warnings}`))),
      el('p', { class: 'ifcvo-muted' }, labels.note))
  })
}

const PANELS = { explorer, details, views, score }

function init() {
  const roots = [...document.querySelectorAll('[data-ifcvo-viewer]')]
  if (roots[0] && !roots[0].dataset.ifcvoReady) { roots[0].dataset.ifcvoReady = '1'; mountViewer(roots[0]) }
  for (const p of document.querySelectorAll('[data-ifcvo-panel]')) {
    if (p.dataset.ifcvoReady) continue
    p.dataset.ifcvoReady = '1'
    PANELS[p.dataset.ifcvoPanel]?.(p)
  }
}

init()
// The theme editor adds and re-renders sections without a page load.
document.addEventListener('shopify:section:load', init)
