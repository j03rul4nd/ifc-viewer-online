// Renders the REAL theme app extension blocks (Liquid from app/extensions/ifc-viewer)
// into a static demo product page, so the listing screenshots show the shipped UI
// and runtime (assets/*.js + the live viewer), not a mock-up. Shopify-only tags and
// filters get minimal stand-ins (t, asset_url, form, schema…).
// Needs liquidjs (not a repo dependency): npm i liquidjs@10 somewhere, then set LIQUIDJS
// to its file URL, e.g. file:///tmp/h/node_modules/liquidjs/dist/liquid.node.mjs
//   node integrations/shopify/listing/v3/harness/render.mjs
const { Liquid, Tag } = await import(process.env.LIQUIDJS || 'liquidjs')
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STORE, SCENES } from './scenes.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const ext = join(here, '../../../app/extensions/ifc-viewer')
const out = join(here, 'out')
mkdirSync(out, { recursive: true })
const ASSETS = '/app/extensions/ifc-viewer/assets/'
// LOCAL_APP=http://127.0.0.1:5199/ runs the viewer from `vite` in this repo instead of the live site.
const LOCAL_APP = process.env.LOCAL_APP || ''
const en = JSON.parse(readFileSync(join(ext, 'locales/en.default.json'), 'utf8'))

const engine = new Liquid({ root: [join(ext, 'snippets')], extname: '.liquid', strictVariables: false, jsTruthy: false })
const lookup = (k) => k.split('.').reduce((o, p) => (o == null ? o : o[p]), en)
engine.registerFilter('t', (key, ...args) => {
  let s = lookup(String(key)) ?? key
  for (const a of args) if (Array.isArray(a)) s = String(s).replaceAll(`{{ ${a[0]} }}`, a[1])
  return s
})
engine.registerFilter('asset_url', (n) => ASSETS + n)
engine.registerFilter('image_url', (u) => u)
engine.registerFilter('image_tag', (u) => `<img src="${u}" alt="">`)
engine.registerFilter('default_errors', () => '')
engine.registerFilter('money', (v) => v)
engine.registerFilter('json', (v) => JSON.stringify(v ?? null))
engine.registerFilter('url_encode', (v) => encodeURIComponent(v ?? ''))
engine.registerFilter('newline_to_br', (v) => String(v ?? '').replaceAll('\n', '<br />\n'))
engine.registerFilter('sheets', (v) => v)
// {% form 'contact', id: … %}…{% endform %}: a plain form with the same body.
engine.registerTag('form', class extends Tag {
  constructor(tok, rem, liquid) {
    super(tok, rem, liquid); this.tpls = []
    const stream = liquid.parser.parseStream(rem).on('tag:endform', () => stream.stop()).on('template', (t) => this.tpls.push(t)).on('end', () => { throw new Error('form not closed') })
    stream.start()
  }
  * render(ctx, emitter) {
    emitter.write('<form method="post" action="#" onsubmit="return false">')
    ctx.push({ form: { posted_successfully: false, errors: null } })
    yield this.liquid.renderer.renderTemplates(this.tpls, ctx, emitter)
    ctx.pop()
    emitter.write('</form>')
  }
})
engine.registerTag('schema', class extends Tag {
  constructor(tok, rem, liquid) { super(tok, rem, liquid); while (rem.length) { const t = rem.shift(); if (t.name === 'endschema') break } }
  render() {}
})

/** Defaults from a block's {% schema %}, so each block renders as a merchant would add it. */
function defaults(src) {
  const m = src.match(/{%-?\s*schema\s*-?%}([\s\S]*?){%-?\s*endschema/)
  const o = {}
  if (m) for (const s of JSON.parse(m[1]).settings || []) if (s.id) o[s.id] = s.default ?? (s.type === 'checkbox' ? false : '')
  return o
}

const mf = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { value: v }]))
function product(p) {
  const variants = p.variants.map((v, i) => ({ id: 4100 + i, title: v.title, available: true, metafields: { custom: mf(v.custom || {}) } }))
  return {
    id: 8800, handle: p.handle, title: p.title, has_only_default_variant: variants.length < 2,
    variants, selected_or_first_available_variant: variants[0], featured_media: p.poster || '',
    metafields: { custom: mf(p.custom), bim: mf(p.bim || {}), ifcvo: mf(p.ifcvo || {}) },
  }
}

async function block(name, prod, settings = {}, i = 0) {
  const src = readFileSync(join(ext, 'blocks', name + '.liquid'), 'utf8')
  const b = { id: `b${i}`, type: `shopify://apps/ifcvo/blocks/${name}/x`, settings: { ...defaults(src), ...settings }, shopify_attributes: '' }
  return engine.parseAndRender(src, {
    block: b, product: prod, section: { index: 1, blocks: [b] }, customer: null,
    app: { metafields: { ifcvo: { plan: { value: 'business' } } } },
    shop: { permanent_domain: 'atelier-modular.myshopify.com', metafields: { ifcvo: { config: { value: STORE.config }, labels: { value: null }, license: { value: '' } } } },
    request: { locale: { iso_code: 'en' }, design_mode: false }, routes: { account_register_url: '#', account_login_url: '#' },
  })
}

const css = readFileSync(join(here, 'store.css'), 'utf8')
for (const sc of SCENES) {
  const prod = product(sc.product)
  let i = 0
  const media = [], info = []
  for (const [name, settings, col] of sc.blocks) (col === 'info' ? info : media).push(await block(name, prod, { accent: STORE.accent, ...settings }, i++))
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${sc.product.title} – ${STORE.name}</title><link rel="stylesheet" href="${ASSETS}ifcvo.css"><style>${css}${sc.css || ''}</style></head>
<body class="${sc.mobile ? 'm' : ''}"><script>document.addEventListener('ifcvo:viewer', (e) => { window.__viewer = e.detail.viewer })
// Capture only: keep a handle on the compare block's viewers so the shot can frame them alike.
window.__cmp = []
document.addEventListener('ifcvo:loaded', () => { window.__loaded = true }, true)
const hook = setInterval(() => {
  const api = window.IFCVO
  if (!api || !api.loadSdk || api.__hooked) return
  clearInterval(hook); api.__hooked = true
  const load = api.loadSdk.bind(api)
  api.loadSdk = async () => { const sdk = await load(); return { ...sdk, IfcViewer: class extends sdk.IfcViewer { constructor(...a) { super(...a); window.__cmp.push(this) } async getProductData(o) { try { const r = await super.getProductData(o); console.warn('gpd ok', r && r.elementCount); return r } catch (e) { console.warn('gpd err', String(e)); throw e } } } } }
}, 20)</script>${LOCAL_APP ? `<script type="module">
// Capture only: run the viewer from a local build of this repo (unreleased grid/finish options).
import { _setSdk } from '${ASSETS}ifcvo.js'
_setSdk(async () => {
  const m = await import('${LOCAL_APP}src/sdk/ifc-viewer-sdk.ts')
  return { ...m, IfcViewer: class extends m.IfcViewer { constructor(el, o = {}) { super(el, { baseUrl: '${LOCAL_APP}', ...o }) } } }
})
</script>` : ''}<div class="bar">${STORE.announce}</div>
<header><span class="brand">${STORE.name}</span><nav>${STORE.nav.map((n) => `<a>${n}</a>`).join('')}</nav><span class="icons">Search&nbsp;&nbsp;Account&nbsp;&nbsp;Cart</span></header>
<main class="pp"><section class="media">${media.join('\n')}</section>
<section class="info"><p class="crumb">${sc.product.collection}</p><h1>${sc.product.title}</h1><p class="lede">${sc.product.lede}</p>
${prod.variants.length > 1 ? `<fieldset class="variants"><legend>${sc.product.option}</legend>${prod.variants.map((v, k) => `<label class="${k === 0 ? 'on' : ''}">${v.title}</label>`).join('')}</fieldset>` : ''}
${sc.cta === false ? '' : '<button class="buy">Request a sample</button>'}
${info.join('\n')}</section></main></body></html>`
  writeFileSync(join(out, sc.id + '.html'), html)
  console.log('rendered', sc.id)
}
