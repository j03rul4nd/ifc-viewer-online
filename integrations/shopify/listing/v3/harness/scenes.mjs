// One demo store ("Atelier Modular") and the product pages the listing shows.
// Models are the public samples on www.ifcvieweronline.eu. No prices anywhere:
// Shopify does not allow pricing in listing images.
const M = 'https://www.ifcvieweronline.eu/'
export const MODELS = {
  duplex: M + 'Ifc2x3_Duplex_Architecture.ifc',
  vela: M + 'models/hotel-vela/BCN-IVO-ZZ-XX-M3-A-0002.ifc',
  velaS: M + 'models/hotel-vela/BCN-IVO-ZZ-XX-M3-S-0002.ifc',
  tram: M + 'models/tokyo/waseda-tram-stop.ifc',
  bench: M + 'models/barcelona-catalunya/falques-bench-lamps.ifc',
}

export const STORE = {
  name: 'Atelier Modular',
  accent: '#2f5d50',
  announce: 'BIM models for every product · Free samples for specifiers',
  nav: ['Houses', 'Structures', 'Street furniture', 'For architects', 'Trade'],
  config: {},
}

const viewer = (extra = {}) => ['product-ifc-viewer', { load: 'visible', ui: 'kiosk', lang: 'en', view: 'iso', validate: false, background: 'brand', bg_top: '#fbfaf7', bg_bottom: '#e9e5db', height: 600, radius: 6, download: false, specs_namespace: '', ...extra }]

const duplex = {
  handle: 'duplex-house-kit', title: 'Duplex House Kit D-2', collection: 'Houses / Two-family',
  lede: 'Two mirrored three-bedroom homes on one slab, delivered as a panelised kit.',
  custom: { ifc_model: MODELS.duplex, bim_files: [] },
  bim: { gross_floor_area: '263 m²', storeys: '2', bedrooms: '3 + 3', wall_system: 'Timber frame, 140 mm' },
  variants: [{ title: 'Standard' }],
}
const frame = {
  handle: 'steel-frame-hotel-module', title: 'Structural Frame SF-12', collection: 'Structures / Frames',
  lede: 'Concrete columns, slabs and core walls for a curved hotel tower.',
  custom: { ifc_model: MODELS.velaS }, bim: {}, variants: [{ title: 'Standard' }],
}
const hotel = {
  handle: 'vela-hotel-module', title: 'Hotel Block H-4', collection: 'Structures / Hospitality',
  lede: 'Prefabricated hotel block: podium, four guest floors and roof plant.',
  custom: { ifc_model: MODELS.vela, bim_files: [] }, bim: {}, variants: [{ title: 'Standard' }],
}
const street = {
  handle: 'transit-shelter', title: 'Transit Shelter Line', collection: 'Street furniture',
  lede: 'Shelters and benches for tram and bus stops, in two configurations.', option: 'Configuration',
  custom: { ifc_model: MODELS.tram },
  variants: [{ title: 'Tram stop', custom: { ifc_model: MODELS.tram } }, { title: 'Bench with lamps', custom: { ifc_model: MODELS.bench } }],
}

// [block, settings, column]: column 'info' is the right-hand product info column.
export const SCENES = [
  { id: 'd1-explore', product: duplex, blocks: [viewer({ height: 660 }), ['ifc-rooms', {}, 'info']] },
  { id: 'd2-data', product: frame, blocks: [viewer({ height: 660 }), ['ifc-takeoff', {}, 'info']] },
  { id: 'd3-quote', product: hotel, blocks: [viewer({ height: 660 }), ['ifc-quote', {}, 'info']], cta: false },
  { id: 'd4-downloads', product: duplex, blocks: [viewer({ height: 660 }), ['ifc-downloads', { gate: 'customer', glb: true, csv: true }, 'info'], ['ifc-capture', {}, 'info']] },
  { id: 'd5-compare', product: street, blocks: [['ifc-compare', {}], viewer({ height: 300, load: 'click' })] },
  { id: 'd6-planset', product: duplex, blocks: [viewer({ height: 660 }), ['ifc-plan-set', {}, 'info'], ['ifc-ar', {}, 'info']], cta: false },
  { id: 'm1-explore', mobile: true, product: duplex, blocks: [viewer({ height: 420 }), ['ifc-rooms', {}, 'info']] },
  { id: 'm2-quote', mobile: true, product: hotel, blocks: [viewer({ height: 360 }), ['ifc-quote', {}, 'info']], cta: false },
  { id: 'm3-downloads', mobile: true, cta: false, product: duplex, blocks: [viewer({ height: 240 }), ['ifc-downloads', { gate: 'customer', glb: true, csv: true }, 'info'], ['ifc-capture', {}, 'info']] },
]
