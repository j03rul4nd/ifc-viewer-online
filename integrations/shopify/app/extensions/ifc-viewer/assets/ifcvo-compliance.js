// "IFC compliance" block (Business): once the page's viewer has a model,
// checks it in the visitor's browser and shows up to three badges:
//   • NBS BIM Object Standard — X of Y machine-checkable clauses pass
//     (SDK checkEir('builtin-nbs-bos'));
//   • IDS — pass / fail against the merchant's .ids file (https URL from the
//     `bim.ids_url` metafield or the block setting; SDK checkIds(xml));
//   • Health Score (SDK validate()).
// A <details> list names each failed requirement in plain language. The note
// says what this is: computed in this browser today, not a certification.
//
// Never blocks the page: runs after `model-loaded`, in idle time, one check at
// a time, each capped (block setting, default 30 s). A check that fails or
// times out shows "could not be checked" and the others still run.
import './ifcvo-i18n.js'

export const LABELS = {
  title: 'Compliance',
  nbs: 'NBS object standard: {passed}/{total} checks',
  nbsNone: 'NBS object standard: no product class to check',
  idsPass: 'IDS: pass ({passed}/{total})',
  idsFail: 'IDS: fail ({failed} of {total} not met)',
  idsNone: 'IDS: nothing in the model to check',
  score: 'Health Score: {score}/100',
  waiting: 'Open the 3D model to check it.',
  running: 'Checking the model in your browser…',
  error: 'could not be checked',
  details: 'What did not pass ({count})',
  allPass: 'Every checked requirement passes.',
  manual: 'Not checked automatically (needs a person):',
  note: 'Checked in your browser on {date}. A self-check of the file, not a certification.',
  more: '…and {count} more',
  typed: 'Type object (IfcTypeObject): {typed}/{total} product elements (checked outside IDS)',
  sampled: 'Checked {total} of {all} elements.',
  untyped: '{count} product elements have no type object (IfcTypeObject)',
}

/** NBS clauses the profile cannot decide; mirrors NBS_BOS_MANUAL in src/lib/eir/eir-profile-nbs.ts. */
export const NBS_MANUAL = [
  'Geometry is not overburdened',
  'Naming follows the NBS convention',
  'Property values are true to the real product',
  'Materials are named and assigned correctly',
  'Behaviour and presentation',
]

const MAX_LISTED = 50

/** Product classes of the NBS profile (mirrors NBS_BOS_CLASSES). */
export const NBS_CLASSES = ['IfcDoor', 'IfcWindow', 'IfcWall', 'IfcSlab', 'IfcCovering', 'IfcRoof', 'IfcStair', 'IfcRailing',
  'IfcFurniture', 'IfcSanitaryTerminal', 'IfcLightFixture', 'IfcBuildingElementProxy', 'IfcFurnishingElement', 'IfcFlowTerminal']
/** Elements read for the type check; an object file has a handful. */
export const TYPE_SAMPLE = 200
const FIND_LIMIT = 5000

/**
 * The IfcTypeObject clause, which IDS 1.0 cannot express: how many product
 * elements of the NBS classes are defined by a type object (getElement().typeId).
 * Null when the model has none of those classes.
 */
export async function typeCheck(viewer) {
  if (typeof viewer.findElements !== 'function' || typeof viewer.getElement !== 'function') return null
  const found = (await viewer.findElements({ ifcClass: NBS_CLASSES, limit: FIND_LIMIT })) || []
  if (!found.length) return null
  const hits = found.slice(0, TYPE_SAMPLE)
  let typed = 0
  for (const h of hits) {
    const d = await viewer.getElement(h.expressId, h.modelId)
    if (d && (d.typeId != null || d.typeGlobalId || d.typeClass)) typed++
  }
  // `all` is a lower bound when findElements hit its own limit (shown as N+).
  return { typed, total: hits.length, all: found.length >= FIND_LIMIT ? `${FIND_LIMIT}+` : found.length, capped: found.length > hits.length }
}

/** Adds the type check to an NBS summary as one more check. */
export function withTypeCheck(summary, tc, labels = LABELS) {
  if (!tc) return summary
  const ok = tc.typed === tc.total
  return {
    ...summary, total: summary.total + 1, passed: summary.passed + (ok ? 1 : 0), failed: summary.failed + (ok ? 0 : 1),
    failures: ok ? summary.failures : [...summary.failures, fill(labels.untyped, { count: tc.total - tc.typed })],
    typeCheck: tc,
  }
}

function readJson(text) {
  try { const v = JSON.parse(text || 'null'); return v && typeof v === 'object' ? v : null } catch (e) { return null }
}

/** key=value lines → object. */
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

/** Defaults ← theme locale ← shop ifcvo.labels ← block textarea. Only known keys. */
export function labelsOf(root) {
  const merged = { ...LABELS }
  const layers = [readJson(root.dataset.labels), labelsFor(readJson(root.dataset.ifcvoLabels), root.dataset.locale), parseLabels(root.dataset.labelsOverride)]
  for (const layer of layers) for (const [k, v] of Object.entries(layer || {})) {
    if (k in LABELS && typeof v === 'string' && v && !/^translation missing/i.test(v)) merged[k] = v
  }
  return merged
}

function fill(text, params) {
  return String(text).replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m))
}

/** Only absolute https URLs; anything else is ignored. */
export function safeIdsUrl(raw) {
  const s = String(raw || '').trim()
  if (!s) return null
  try {
    const u = new URL(s)
    return u.protocol === 'https:' ? u.href : null
  } catch (e) { return null }
}

export function config(root) {
  const t = Number(root.dataset.timeout)
  return {
    nbs: root.dataset.showNbs !== 'false',
    ids: root.dataset.showIds !== 'false',
    score: root.dataset.showScore !== 'false',
    details: root.dataset.showDetails !== 'false',
    manual: root.dataset.showManual === 'true',
    idsUrl: safeIdsUrl(root.dataset.idsUrl),
    timeoutMs: Math.min(120, Math.max(5, Number.isFinite(t) && t > 0 ? t : 30)) * 1000,
    labels: labelsOf(root),
  }
}

/** Counts of an IdsResult: specs that applied (not n/a), passed, failed, and the failed spec names. */
export function summarize(result) {
  const specs = (result && Array.isArray(result.specs)) ? result.specs : []
  const applied = specs.filter((s) => s.status !== 'na')
  const failed = applied.filter((s) => s.status === 'fail')
  return { total: applied.length, passed: applied.length - failed.length, failed: failed.length, failures: failed.map((s) => String(s.name || '')) }
}

/** Rejects after `ms`; the underlying work is not cancelled, only no longer awaited. */
export function withTimeout(promise, ms) {
  let timer
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), ms) }),
  ]).finally(() => clearTimeout(timer))
}

/** Resolves in idle time (or after a short delay where requestIdleCallback is missing). */
export function idle() {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') window.requestIdleCallback(() => resolve(), { timeout: 3000 })
    else setTimeout(resolve, 50)
  })
}

async function fetchIds(url, ms) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null
  try {
    const res = await fetch(url, { credentials: 'omit', signal: ctrl ? ctrl.signal : undefined })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const text = await res.text()
    if (text.length > 5_000_000) throw new Error('IDS file too large')
    return text
  } finally { if (timer) clearTimeout(timer) }
}

/** Runs the enabled checks one after the other. Each result: { ok, value } or { ok:false }. */
export async function runChecks(viewer, cfg) {
  const out = {}
  const step = async (key, fn) => {
    await idle()
    try { out[key] = { ok: true, value: await withTimeout(fn(), cfg.timeoutMs) } } catch (e) { out[key] = { ok: false } }
  }
  if (cfg.nbs && typeof viewer.checkEir === 'function') {
    await step('nbs', async () => {
      const s = summarize(await viewer.checkEir('builtin-nbs-bos'))
      let tc = null
      try { tc = await typeCheck(viewer) } catch (e) { tc = null }
      return withTypeCheck(s, tc, cfg.labels || LABELS)
    })
  }
  // One IDS run per distinct URL; each block reads its own (results.idsByUrl).
  const urls = [...new Set(cfg.idsUrls || (cfg.ids && cfg.idsUrl ? [cfg.idsUrl] : []))]
  if (urls.length && typeof viewer.checkIds === 'function') {
    out.idsByUrl = {}
    for (const url of urls) {
      await step('ids', async () => summarize(await viewer.checkIds(await fetchIds(url, cfg.timeoutMs))))
      out.idsByUrl[url] = out.ids
    }
    if (cfg.idsUrl) out.ids = out.idsByUrl[cfg.idsUrl]
  }
  if (cfg.score && typeof viewer.validate === 'function') {
    await step('score', async () => {
      const r = await viewer.validate()
      if (!r || r.qualityScore == null) throw new Error('no score')
      return Math.round(r.qualityScore)
    })
  }
  return out
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v
    else node.setAttribute(k, v)
  }
  for (const c of children) if (c != null) node.append(c)
  return node
}

function badge(kind, state, text) {
  return el('li', { class: 'ifcvo-badge ifcvo-badge-' + state, 'data-badge': kind, 'data-state': state }, text)
}

/** Badges + failures + note. `date` is injectable for tests. */
export function render(root, results, date = new Date()) {
  const cfg = config(root)
  const L = cfg.labels
  const badges = []
  const failures = []
  if (cfg.nbs && results.nbs) {
    const r = results.nbs
    if (!r.ok) badges.push(badge('nbs', 'error', fill(L.nbs, { passed: '–', total: '–' }) + ' — ' + L.error))
    else if (!r.value.total) badges.push(badge('nbs', 'na', L.nbsNone))
    else {
      badges.push(badge('nbs', r.value.failed ? 'fail' : 'pass', fill(L.nbs, r.value)))
      failures.push(...r.value.failures.map((f) => ({ src: 'nbs', text: f })))
    }
  }
  const idsRes = cfg.idsUrl && (results.idsByUrl ? results.idsByUrl[cfg.idsUrl] : results.ids)
  if (cfg.ids && cfg.idsUrl && idsRes) {
    const r = idsRes
    if (!r.ok) badges.push(badge('ids', 'error', 'IDS — ' + L.error))
    else if (!r.value.total) badges.push(badge('ids', 'na', L.idsNone))
    else {
      badges.push(badge('ids', r.value.failed ? 'fail' : 'pass', fill(r.value.failed ? L.idsFail : L.idsPass, r.value)))
      failures.push(...r.value.failures.map((f) => ({ src: 'ids', text: f })))
    }
  }
  if (cfg.score && results.score) {
    const r = results.score
    if (!r.ok) badges.push(badge('score', 'error', fill(L.score, { score: '–' }) + ' — ' + L.error))
    else badges.push(badge('score', r.value >= 75 ? 'pass' : r.value >= 50 ? 'warn' : 'fail', fill(L.score, { score: r.value })))
  }
  const nodes = [el('ul', { class: 'ifcvo-badges', role: 'list' }, ...badges)]
  const tc = cfg.nbs && results.nbs && results.nbs.ok && results.nbs.value.typeCheck
  if (tc) nodes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-typecheck': '' }, fill(L.typed, tc), tc.capped ? ' ' + fill(L.sampled, tc) : null))
  if (cfg.details && (cfg.nbs || cfg.ids)) {
    if (failures.length) {
      const shown = failures.slice(0, MAX_LISTED)
      const list = el('ul', { class: 'ifcvo-fails' }, ...shown.map((f) => el('li', { 'data-src': f.src }, f.text)))
      if (failures.length > shown.length) list.append(el('li', { class: 'ifcvo-muted' }, fill(L.more, { count: failures.length - shown.length })))
      nodes.push(el('details', { class: 'ifcvo-compliance-details' }, el('summary', {}, fill(L.details, { count: failures.length })), list))
    } else if (badges.some((b) => b.dataset.state === 'pass') && !badges.some((b) => b.dataset.state === 'fail')) {
      nodes.push(el('p', { class: 'ifcvo-muted' }, L.allPass))
    }
  }
  if (cfg.manual && cfg.nbs) {
    nodes.push(el('p', { class: 'ifcvo-muted' }, L.manual), el('ul', { class: 'ifcvo-muted ifcvo-manual' }, ...NBS_MANUAL.map((m) => el('li', {}, m))))
  }
  let when
  try { when = date.toLocaleDateString(root.dataset.locale || undefined, { year: 'numeric', month: 'short', day: 'numeric' }) } catch (e) { when = date.toISOString().slice(0, 10) }
  nodes.push(el('p', { class: 'ifcvo-muted', 'data-ifcvo-note': '' }, fill(L.note, { date: when })))
  root.querySelector('[data-ifcvo-live]').replaceChildren(...nodes)
  return { badges: badges.length, failures: failures.length }
}

const mounted = new Set()
let current = null
let running = null
/** Bumped on every model load: a run started for an older model never paints. */
let generation = 0

function message(root, key) {
  root.querySelector('[data-ifcvo-live]').replaceChildren(el('p', { class: 'ifcvo-muted', role: 'status' }, labelsOf(root)[key]))
}

/** Runs once per model load and fills every compliance block on the page. */
export async function refresh(viewer = current) {
  if (!viewer) return
  const roots = [...mounted].filter((r) => r.isConnected)
  if (!roots.length) return
  const gen = ++generation
  // A run still going (e.g. a hung check past its cap) is not awaited for the
  // new model: the SDK has no cancel for checkIds/checkEir, so its late result
  // is dropped by the generation check below instead of overwriting newer badges.
  for (const r of roots) message(r, 'running')
  // One run for the page: the union of what the blocks ask for.
  const cfgs = roots.map(config)
  const union = {
    nbs: cfgs.some((c) => c.nbs), score: cfgs.some((c) => c.score), ids: cfgs.some((c) => c.ids && c.idsUrl),
    idsUrls: cfgs.filter((c) => c.ids && c.idsUrl).map((c) => c.idsUrl),
    timeoutMs: Math.max(...cfgs.map((c) => c.timeoutMs)),
  }
  const run = runChecks(viewer, union)
    .then((results) => { if (gen === generation) for (const r of roots) render(r, results) })
    .catch(() => { if (gen === generation) for (const r of roots) message(r, 'waiting') })
    .finally(() => { if (running === run) running = null })
  running = run
  return run
}

export function attach(viewer) {
  if (!viewer || viewer === current) return
  current = viewer
  if (typeof viewer.on === 'function') viewer.on('model-loaded', () => refresh(viewer))
}

export function init() {
  for (const root of document.querySelectorAll('[data-ifcvo-compliance]')) {
    if (root.dataset.ifcvoCompReady) continue
    root.dataset.ifcvoCompReady = '1'
    const api = window.IFCVO
    if (api && typeof api.gate === 'function' && !api.gate('compliance', root)) continue
    mounted.add(root)
    message(root, 'waiting')
  }
  // The viewer may already be up (this script loaded late): run only if it already holds a model.
  const v = window.IFCVO && window.IFCVO.viewer
  if (v && v !== current) {
    attach(v)
    if (typeof v.getModels === 'function') Promise.resolve().then(() => v.getModels()).then((m) => { if (Array.isArray(m) && m.length) refresh(v) }).catch(() => {})
  }
}

export function destroy(container) {
  for (const r of mounted) if (container.contains(r)) mounted.delete(r)
}

/** For tests. */
export function _reset() { mounted.clear(); current = null; running = null; generation = 0 }

export function onViewer(e) {
  const v = (e.detail && e.detail.viewer) || (window.IFCVO && window.IFCVO.viewer)
  if (!v) return
  const fresh = v !== current
  attach(v)
  // `ifcvo:loaded` means a model is in; `ifcvo:viewer` alone does not.
  if (e.type === 'ifcvo:loaded' && (fresh || typeof v.on !== 'function')) refresh(v)
}

if (typeof document !== 'undefined') {
  document.addEventListener('ifcvo:viewer', onViewer)
  document.addEventListener('ifcvo:loaded', onViewer)
  document.addEventListener('shopify:section:load', init)
  document.addEventListener('shopify:section:unload', (e) => destroy(e.target))
  init()
}
