// One demo store ("Atelier Modular") and the product pages the listing shows.
// Models are the public samples on www.ifcvieweronline.eu. No prices anywhere:
// Shopify does not allow pricing in listing images.
const M = 'https://www.ifcvieweronline.eu/'
export const MODELS = {
  shanghai: M + 'models/shanghai-tower/SHA-IVO-SHANGHAI-TOWER-A-0001.ifc',
  swfc: M + 'models/swfc/SHA-IVO-SWFC-A-0001.ifc',
  pearl: M + 'models/oriental-pearl/SHA-IVO-ORIENTAL-PEARL-A-0001.ifc',
  vela: M + 'models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc',
  torre: M + 'models/torre-poblenou/BCN-IVO-ZZ-XX-M3-Z-0002.ifc',
  hall: M + 'models/steel-demo/steel-hall.ifc',
  // Owner-supplied sample, not public: the page starts on a tiny public file and shoot.mjs
  // swaps in the local Wukang IFC through the SDK (add bytes), see LOCAL in shoot.mjs.
  wukang: M + 'HelloWorld.ifc',
}

export const STORE = {
  name: 'Atelier Modular',
  accent: '#2f5d50',
  announce: 'Architectural BIM models · IFC for specifiers and studios',
  nav: ['Heritage buildings', 'Landmark towers', 'Hotels', 'Steel structures', 'For specifiers'],
  config: {},
}

// The viewer backdrop is the store's own paper tone, so model and page read as one.
const viewer = (extra = {}) => ['product-ifc-viewer', { load: 'visible', ui: 'kiosk', lang: 'en', view: 'iso', validate: false, background: 'brand', bg_top: '#f6f3ec', bg_bottom: '#e6e1d5', height: 600, radius: 6, download: false, specs_namespace: '', ...extra }]
const product = (handle, title, collection, lede, model) => ({ handle, title, collection, lede, custom: { ifc_model: model, bim_files: [] }, variants: [{ title: 'Standard' }] })

const wukang = product('wukang-mansion', 'Wukang Mansion', 'Heritage buildings', 'LOD300 model of the 1924 apartment building: rooms per floor, stairs and arcades.', MODELS.wukang)
const shanghai = product('shanghai-tower', 'Shanghai Tower', 'Landmark towers', 'Architectural IFC model: twisting double façade, sky lobbies, podium and site.', MODELS.shanghai)
const swfc = product('world-financial-center', 'World Financial Center', 'Landmark towers', 'Architectural IFC model of the tapered tower with its open crown and podium.', MODELS.swfc)
const pearl = product('oriental-pearl-tower', 'Oriental Pearl Tower', 'Landmark towers', 'Architectural IFC model: spheres, columns, observation decks and base.', MODELS.pearl)
const hotel = product('hotel-block', 'Hotel Block H-4', 'Hotels', 'Curved hotel tower on a podium, with curtain wall, slabs and site walls.', MODELS.vela)
const hall = product('portal-frame-hall', 'Portal Frame Hall S-24', 'Steel structures', 'Bolted steel portal frame with bracing and purlins, ready for takeoff.', MODELS.hall)
const blocks = {
  handle: 'mid-rise-blocks', title: 'Mid-rise Blocks', collection: 'Offices / Hotels',
  lede: 'Two buildings on one product page: pick the program, see the difference.', option: 'Program',
  custom: { ifc_model: MODELS.torre },
  variants: [{ title: 'Office tower', custom: { ifc_model: MODELS.torre } }, { title: 'Hotel', custom: { ifc_model: MODELS.vela } }],
}

// [block, settings, column]: column 'info' is the right-hand product info column.
// `css` is capture-only layout (e.g. hiding the product viewer the compare block reads from).
export const SCENES = [
  { id: 'd1-explore', product: wukang, blocks: [viewer({ height: 660 }), ['ifc-rooms', {}, 'info']] },
  { id: 'd2-data', product: hall, blocks: [viewer({ height: 660 }), ['ifc-takeoff', {}, 'info']], cta: false },
  { id: 'd3-quote', product: hotel, blocks: [viewer({ height: 660 }), ['ifc-quote', {}, 'info']], cta: false },
  { id: 'd4-downloads', product: shanghai, blocks: [viewer({ height: 660 }), ['ifc-downloads', { gate: 'customer', glb: true, csv: true }, 'info'], ['ifc-capture', {}, 'info']] },
  { id: 'd5-compare', product: blocks, blocks: [['ifc-compare', {}], viewer({ height: 300, load: 'click' })], cta: false, css: '.media .ifcvo-product{display:none} .ifcvo-compare .ifcvo-compare-stage{height:420px}' },
  { id: 'd6-planset', product: pearl, blocks: [viewer({ height: 660 }), ['ifc-plan-set', {}, 'info'], ['ifc-ar', {}, 'info']], cta: false },
  { id: 'm1-explore', mobile: true, product: wukang, blocks: [viewer({ height: 460 }), ['ifc-rooms', {}, 'info']] },
  { id: 'm2-quote', mobile: true, product: hotel, blocks: [viewer({ height: 360 }), ['ifc-quote', {}, 'info']], cta: false },
  { id: 'm3-downloads', mobile: true, cta: false, product: swfc, blocks: [viewer({ height: 300 }), ['ifc-downloads', { gate: 'customer', glb: true, csv: true }, 'info'], ['ifc-capture', {}, 'info']] },
]
