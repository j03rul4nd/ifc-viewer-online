// "IFC compatibility" block: answers the three questions buyers of BIM objects
// ask before paying — will it open in my software, is it heavy, is it valid?
//   1. Compatibility: IFC schema + MVD + authoring app from the STEP header
//      (first ~4 KB of the file, ranged fetch, failure tolerant). Apps the
//      merchant lists (metafield bim.compatible_with, rendered by Liquid) win;
//      otherwise conservative "typical" defaults per schema.
//   2. File weight: size (metafield / HEAD), element count from the viewer.
//   3. Health badge: the viewer's validation score + top 3 issue categories.
// Nothing here blocks the page: every probe can fail and the block stays quiet.
import './ifcvo-i18n.js'

export const LABELS = {
  schema: 'IFC schema', mvd: 'Model view', app: 'Made with', worksWith: 'Opens in',
  typical: 'typical for this schema; check your version', weight: 'File weight', size: 'Size',
  elements: 'Elements', light: 'Light', medium: 'Medium', heavy: 'Heavy',
  thresholds: 'Light: under 20 MB and 5,000 elements. Heavy: 100 MB or 50,000 elements and more.',
  health: 'Health Score', issues: 'Main issues', noIssues: 'No issues found',
  unknown: 'Not stated in the file', unavailable: 'Not available for this file',
}

/** Validator ruleId → English label; the block passes translated ones (data-rule-labels, keyed without RULE_ in lower case). */
export const RULE_LABELS = {
  duplicate_name: 'Duplicate names', empty_name: 'Missing names', duplicate_guid: 'Duplicate GUIDs', missing_type: 'Missing types',
  missing_material: 'Missing materials', empty_property_value: 'Empty property values', empty_longname: 'Missing long names',
  invalid_ifc_version: 'IFC version', file_author_missing: 'File author missing', iso19650_filename: 'File name (ISO 19650)',
  clash_mep_structural: 'MEP / structure clashes',
}

export const ruleKey = (id) => String(id || '').replace(/^RULE_/i, '').toLowerCase()

/** Conservative, per schema. Shown only when the merchant lists nothing, and labelled "typical". */
export const DEFAULT_APPS = {
  IFC2x3: ['Revit 2014+', 'Archicad 16+', 'Tekla Structures 19+', 'Allplan 2015+', 'Bonsai (Blender)'],
  IFC4: ['Revit 2019+', 'Archicad 22+', 'Tekla Structures 2019+', 'Allplan 2020+', 'Bonsai (Blender)'],
  IFC4x3: ['Revit 2025+', 'Archicad 28+', 'Tekla Structures 2024+', 'Bonsai (Blender)'],
}

export const THRESHOLDS = { lightMb: 20, heavyMb: 100, lightElements: 5000, heavyElements: 50000 }

/** STEP argument list → nested arrays; strings unescaped ('' → '), $ and * → null, other tokens as text. */
export function parseArgs(text, start) {
  let i = start
  const stack = [[]]
  while (i < text.length) {
    const c = text[i]
    if (c === "'") {
      let s = ''
      i++
      while (i < text.length) {
        if (text[i] === "'") { if (text[i + 1] === "'") { s += "'"; i += 2; continue } break }
        s += text[i++]
      }
      stack[stack.length - 1].push(decodeStep(s))
      i++
    } else if (c === '(') { const a = []; stack[stack.length - 1].push(a); stack.push(a); i++ }
    else if (c === ')') { stack.pop(); i++; if (stack.length === 1) break }
    else if (c === ',' || /\s/.test(c)) i++
    else {
      const m = /^[^,()'\s]+/.exec(text.slice(i))
      const tok = m ? m[0] : c
      stack[stack.length - 1].push(tok === '$' || tok === '*' ? null : tok)
      i += tok.length
    }
  }
  return stack[0][0] || []
}

function entity(text, name) {
  const m = new RegExp('\\b' + name + '\\s*\\(', 'i').exec(text)
  return m ? parseArgs(text, m.index + m[0].length - 1) : null
}

const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : v == null ? [] : [String(v)])

/** "IFC4X3_ADD2" → "IFC4x3", "ifc2x3_tc1" → "IFC2x3", "IFC4" → "IFC4". Unknown → as written. */
export function normalizeSchema(raw) {
  const s = String(raw || '').trim().toUpperCase()
  if (!s) return ''
  if (/^IFC2X3/.test(s)) return 'IFC2x3'
  if (/^IFC4X3/.test(s)) return 'IFC4x3'
  if (/^IFC4(X[12])?(_|$)/.test(s)) return 'IFC4'
  return String(raw).trim()
}

/**
 * STEP string encodings (ISO 10303-21): \X2\hhhh…\X0\ (UTF-16), \X4\hhhhhhhh…\X0\
 * (UTF-32), \X\hh (ISO-8859-1), \S\c (c + 128), \P?\ (code page, dropped), \\ → \.
 * The '' quote escape is handled by the tokenizer.
 */
export function decodeStep(raw) {
  return String(raw)
    .replace(/\\X2\\((?:[0-9A-F]{4})*)\\X0\\/gi, (_, hex) => String.fromCharCode(...(hex.match(/.{4}/g) || []).map((h) => parseInt(h, 16))))
    .replace(/\\X4\\((?:[0-9A-F]{8})*)\\X0\\/gi, (_, hex) => String.fromCodePoint(...(hex.match(/.{8}/g) || []).map((h) => parseInt(h, 16))))
    .replace(/\\X\\([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (_, c) => String.fromCharCode(c.charCodeAt(0) + 128))
    .replace(/\\P[A-I]\\/g, '')
    .replace(/\\\\/g, '\\')
}

/** /* … *\/ comments out, but not inside STEP strings. */
export function stripComments(text) {
  let out = ''
  let inStr = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) { out += c; if (c === "'") inStr = false; continue }
    if (c === "'") { inStr = true; out += c; continue }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) break
      i = end + 1
      out += ' '
      continue
    }
    out += c
  }
  return out
}

const hasWords = (s) => /[A-Za-z]{3,}/.test(s)
/** Build stamps such as "20100326_1700" or bare versions are not an app name. */
const isStamp = (s) => !s || /^[\d\s._:+\-/T]+$/.test(s)

/** "Autodesk Revit Architecture 2011 - 1.0" → "Autodesk Revit Architecture 2011"; exporter / UI tails dropped. */
export function cleanApp(s) {
  return String(s || '')
    .replace(/\s+-\s+(Exporter|Alternate UI)\b.*$/i, '')
    .replace(/\s+-\s+[\d.]+\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Authoring app from FILE_NAME: originating_system (index 5) when it names an
 * app, else preprocessor_version (index 4). Revit's IFC exporter writes only
 * "23.0.1.318 - Exporter …" there: that is Revit 2023.
 */
export function authoringApp(originating, preprocessor) {
  const o = String(originating || '').trim()
  const p = String(preprocessor || '').trim()
  const revit = /^(\d{2})\.\d+(?:\.\d+)*\s*-\s*Exporter\b/i.exec(o)
  if (revit) return `Autodesk Revit 20${revit[1]}`
  const oc = cleanApp(o)
  if (!isStamp(oc) && hasWords(oc)) return oc
  const pc = cleanApp(p)
  if (!isStamp(pc) && hasWords(pc)) return pc
  return oc || pc
}

/** The STEP header → { schema, schemaRaw, mvd[], app, preprocessor }. Missing fields are '' / []. */
export function parseHeader(text) {
  const t = stripComments(String(text || ''))
  const end = t.search(/\bENDSEC\s*;/i)
  const head = end > 0 ? t.slice(0, end) : t
  const schemaRaw = flat(entity(head, 'FILE_SCHEMA'))[0] || ''
  const desc = flat(entity(head, 'FILE_DESCRIPTION')).join(' ')
  const mvd = []
  for (const m of desc.matchAll(/ViewDefinition\s*\[([^\]]*)\]/gi)) {
    for (const v of m[1].split(',')) if (v.trim()) mvd.push(v.trim())
  }
  const name = entity(head, 'FILE_NAME') || []
  const str = (v) => (typeof v === 'string' ? v.trim() : '')
  return { schema: normalizeSchema(schemaRaw), schemaRaw: schemaRaw.trim(), mvd, app: authoringApp(str(name[5]), str(name[4])), preprocessor: str(name[4]) }
}

/** Light / medium / heavy from what is known; null when nothing is. */
export function weightBand(sizeMb, elements, th = THRESHOLDS) {
  const mb = Number(sizeMb) || 0
  const n = Number(elements) || 0
  if (!mb && !n) return null
  if (mb >= th.heavyMb || n >= th.heavyElements) return 'heavy'
  if ((!mb || mb < th.lightMb) && (!n || n < th.lightElements)) return 'light'
  return 'medium'
}

/** "missing-name" / "IFC_GUID_DUPLICATE" → "Missing name" / "Ifc guid duplicate". */
export function ruleLabel(id, map = RULE_LABELS) {
  const k = ruleKey(id)
  if (map && map[k]) return map[k]
  if (RULE_LABELS[k]) return RULE_LABELS[k]
  const s = String(id || '').replace(/^RULE_/i, '').replace(/[_.:-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase()
  return s ? s[0].toUpperCase() + s.slice(1) : ''
}

/** Issues → top N categories by count (errors weigh before warnings on ties). */
export function topCategories(issues, n = 3, map = RULE_LABELS) {
  const by = new Map()
  for (const i of issues || []) {
    if (!i || !i.ruleId) continue
    const c = by.get(i.ruleId) || { id: i.ruleId, label: ruleLabel(i.ruleId, map), count: 0, errors: 0 }
    c.count++
    if (i.severity === 'error') c.errors++
    by.set(i.ruleId, c)
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.errors - a.errors).slice(0, n)
}

async function readRange(url, from, to, fetchImpl, signal, max) {
  const res = await fetchImpl(url, { headers: { Range: `bytes=${from}-${to}` }, signal })
  if (!res || !res.ok) return null
  // 200 = the host ignored Range and sends the whole file: read only `max` bytes of it.
  const whole = res.status !== 206
  const limit = whole ? max : to - from + 1
  const bytes = []
  let got = 0
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader()
    while (got < limit) {
      const { done, value } = await reader.read()
      if (done) break
      bytes.push(value)
      got += value.length
    }
    try { reader.cancel() } catch (e) { /* done */ }
  } else {
    const buf = new Uint8Array(await res.arrayBuffer())
    bytes.push(buf)
    got = buf.length
  }
  const all = new Uint8Array(Math.min(got, limit))
  let off = 0
  for (const b of bytes) { const part = b.subarray(0, all.length - off); all.set(part, off); off += part.length; if (off >= all.length) break }
  return { data: all, whole }
}

/**
 * The STEP header text: the first 4 KB, and once more up to 16 KB when ENDSEC; is
 * not in them. null on any failure (CORS, 404, timeout, not a STEP file).
 */
export async function fetchHeader(url, { bytes = 4096, max = 16384, ms = 4000, fetchImpl = fetch } = {}) {
  if (!/^https?:/i.test(String(url || ''))) return null
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const t = setTimeout(() => ctl && ctl.abort(), ms)
  const signal = ctl ? ctl.signal : undefined
  const dec = (d) => new TextDecoder('utf-8').decode(d)
  try {
    const first = await readRange(url, 0, bytes - 1, fetchImpl, signal, max)
    if (!first) return null
    let text = dec(first.data)
    if (!/ISO-10303-21/i.test(text.slice(0, 200))) return null
    const done = () => /\bENDSEC\s*;/i.test(text)
    if (!first.whole) {
      if (done()) return text
      const next = await readRange(url, bytes, max - 1, fetchImpl, signal, max - bytes)
      if (next) text += dec(next.whole ? next.data.subarray(bytes) : next.data)
    }
    return text.slice(0, max)
  } catch (e) { return null } finally { clearTimeout(t) }
}

async function headSize(url) {
  if (!/^https?:/i.test(String(url || ''))) return 0
  try {
    const ctl = new AbortController()
    const t = setTimeout(() => ctl.abort(), 3000)
    const res = await fetch(url, { method: 'HEAD', signal: ctl.signal })
    clearTimeout(t)
    const n = Number(res.headers.get('content-length'))
    return n > 0 ? n / 1048576 : 0
  } catch (e) { return 0 }
}

// ── DOM ──────────────────────────────────────────────────────────────────────

function el(tag, attrs, ...kids) {
  const n = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v)
  for (const k of kids) if (k != null && k !== '') n.append(k)
  return n
}

function parseLines(text) {
  const out = {}
  for (const line of String(text || '').split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i > 0) { const k = line.slice(0, i).trim(); const v = line.slice(i + 1).trim(); if (k && v) out[k] = v }
  }
  return out
}

function labelsOf(root) {
  const api = typeof window !== 'undefined' && window.IFCVO
  let shop = {}
  try { if (api && typeof api.labels === 'function') shop = api.labels(root) || {} } catch (e) { /* none */ }
  let local = {}
  try { local = JSON.parse(root.dataset.labels || '{}') || {} } catch (e) { /* defaults */ }
  for (const key of Object.keys(local)) if (!local[key] || /translation missing/i.test(local[key])) delete local[key]
  return { ...LABELS, ...local, ...shop, ...parseLines(root.dataset.labelsOverride) }
}

const fmtMb = (mb) => (mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10) + ' MB'

function row(label, value) {
  return el('div', { class: 'ifcvo-compat-row' }, el('dt', {}, label), el('dd', {}, value))
}

export function renderCompat(root, header, labels = labelsOf(root)) {
  const box = root.querySelector('[data-ifcvo-compat-header]')
  if (!box || !header) return
  const dl = el('dl', { class: 'ifcvo-compat-list' },
    row(labels.schema, header.schema || header.schemaRaw || labels.unknown),
    row(labels.mvd, header.mvd.length ? header.mvd.join(', ') : labels.unknown),
    row(labels.app, header.app || header.preprocessor || labels.unknown))
  box.replaceChildren(dl)
  const apps = root.querySelector('[data-ifcvo-compat-apps]')
  // Merchant list (server-rendered) wins: only fill an empty one.
  if (apps && !apps.dataset.merchant && DEFAULT_APPS[header.schema]) {
    apps.replaceChildren(
      el('h4', {}, labels.worksWith),
      el('ul', { class: 'ifcvo-compat-apps' }, ...DEFAULT_APPS[header.schema].map((a) => el('li', {}, a))),
      el('p', { class: 'ifcvo-muted' }, labels.typical))
  }
}

/** The header could not be read: a final state, never the waiting text. Merchant / typical apps stay. */
export function renderUnavailable(root, labels = labelsOf(root)) {
  const box = root.querySelector('[data-ifcvo-compat-header]')
  if (!box) return
  box.dataset.state = 'unavailable'
  box.replaceChildren(el('p', { class: 'ifcvo-muted' }, root.dataset.unavailable || labels.unavailable))
}

export function renderWeight(root, state, labels = labelsOf(root)) {
  const box = root.querySelector('[data-ifcvo-compat-weight]')
  if (!box) return
  const band = weightBand(state.sizeMb, state.elements)
  if (!band) return
  const parts = []
  if (state.sizeMb) parts.push(`${labels.size}: ${fmtMb(state.sizeMb)}`)
  if (state.elements) parts.push(`${labels.elements}: ${Number(state.elements).toLocaleString()}`)
  const meter = el('meter', { min: '0', max: '3', low: '1.5', high: '2.5', optimum: '0', value: String({ light: 1, medium: 2, heavy: 3 }[band]), 'aria-label': `${labels.weight}: ${labels[band]}` })
  box.replaceChildren(
    el('h4', {}, labels.weight),
    el('p', { class: 'ifcvo-compat-weight ifcvo-' + band }, meter, ' ', el('strong', {}, labels[band]), parts.length ? ' · ' + parts.join(' · ') : ''),
    el('p', { class: 'ifcvo-muted' }, labels.thresholds))
}

export function renderHealth(root, score, cats, labels = labelsOf(root)) {
  const box = root.querySelector('[data-ifcvo-compat-health]')
  if (!box || score == null) return
  const s = Math.round(score)
  const band = s >= 90 ? 'excellent' : s >= 75 ? 'good' : s >= 50 ? 'fair' : 'poor'
  box.replaceChildren(
    el('h4', {}, labels.health),
    el('p', { class: 'ifcvo-score' }, el('span', { class: 'ifcvo-score-num ifcvo-' + band, role: 'img', 'aria-label': `${labels.health}: ${s} / 100` }, String(s))),
    cats && cats.length
      ? el('div', {}, el('p', { class: 'ifcvo-muted' }, labels.issues), el('ul', {}, ...cats.map((c) => el('li', {}, `${c.label} (${c.count})`))))
      : el('p', { class: 'ifcvo-muted' }, labels.noIssues))
}

const mounted = new Map()
let subscribed = false

function modelUrl(root) {
  if (root.dataset.model) return root.dataset.model
  const v = document.querySelector('[data-ifcvo-viewer]')
  return (v && v.dataset.model) || ''
}

function subscribe() {
  const api = window.IFCVO
  if (subscribed || !api || typeof api.subscribe !== 'function') return
  const anchor = [...mounted.keys()][0]
  if (!anchor) return
  subscribed = true
  api.subscribe(anchor, (type, e) => {
    for (const [root, state] of mounted) {
      if (!root.isConnected) continue
      if (type === 'model-loaded' && e && Number(e.elementCount)) { state.elements = Number(e.elementCount); renderWeight(root, state) }
      if (type === 'validation-completed' && e && e.qualityScore != null && root.dataset.health !== 'false') onHealth(root, e.qualityScore)
    }
  })
}

async function onHealth(root, score) {
  renderHealth(root, score, [])
  try {
    const v = window.IFCVO && window.IFCVO.viewer
    if (!v || typeof v.getIssues !== 'function') return
    const r = await v.getIssues({ limit: 500 })
    let map = null
    try { map = JSON.parse(root.dataset.ruleLabels || 'null') } catch (e) { /* defaults */ }
    renderHealth(root, r && r.qualityScore != null ? r.qualityScore : score, topCategories(r && r.issues, 3, map || RULE_LABELS))
  } catch (e) { /* keep the score alone */ }
}

async function mount(root) {
  const state = { sizeMb: parseFloat(root.dataset.sizeMb) || 0, elements: 0 }
  mounted.set(root, state)
  const url = modelUrl(root)
  renderWeight(root, state)
  fetchHeader(url).then((text) => {
    const h = text ? parseHeader(text) : null
    if (h && (h.schema || h.schemaRaw || h.app || h.mvd.length)) renderCompat(root, h)
    else renderUnavailable(root)
  }, () => renderUnavailable(root))
  if (!state.sizeMb) headSize(url).then((mb) => { if (mb) { state.sizeMb = mb; renderWeight(root, state) } })
}

export function init(doc = document) {
  for (const root of doc.querySelectorAll('[data-ifcvo-compat]')) {
    if (root.dataset.ifcvoCompatReady) continue
    root.dataset.ifcvoCompatReady = '1'
    const api = typeof window !== 'undefined' && window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('compat', root.querySelector('[data-ifcvo-compat-body]'))) continue
    mount(root)
  }
  subscribe()
}

export function destroy(container) {
  for (const r of [...mounted.keys()]) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() { mounted.clear(); subscribed = false }

if (typeof document !== 'undefined') {
  document.addEventListener('ifcvo:ready', () => init())
  document.addEventListener('shopify:section:load', () => init())
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
