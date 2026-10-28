// ── Static shell for /twin-builder ───────────────────────────────────────────
//
// The builder is a SPA route, so without this it was served the root shell:
// the IFC viewer's title, a canonical pointing at "/", nothing for a crawler
// to read. This writes dist/twin-builder/index.html — a copy of dist/index.html
// with its own head (title, description, canonical, OG card, WebApplication +
// HowTo + FAQPage JSON-LD) and a plain-HTML summary inside #root that React
// replaces on mount. Same mechanism as generate-msp-page.ts.
//
// Invoked from vite.config.ts (closeBundle).

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import { builderHreflangs } from './build-twin-builder-landings'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')
const ROUTE = '/twin-builder/'

// Google shows about 60 characters of a title and 160 of a description.
export const TWIN_BUILDER_SEO = {
  title: 'Digital Twin Builder: AGV Warehouse and Import Tracker, Free',
  description:
    'Build your own digital twin in the browser: an AGV warehouse from your layout and products, or an import tracker from your orders spreadsheet. Free, no install.',
  keywords:
    'digital twin builder, build a digital twin, digital twin online free, AGV simulation, warehouse simulator online, AMR fleet simulation, warehouse digital twin software, import tracker, shipment tracking spreadsheet, purchase order tracking map, landed cost calculator, supply chain digital twin',
  image: '/demos/agv-warehouse-digital-twin.jpg',
  imageAlt: 'A warehouse digital twin built in the browser: AGVs, racks and docks from the user’s own layout',
}

const STEPS: { kind: string; name: string; steps: [string, string][] }[] = [
  {
    kind: 'agv', name: 'AGV warehouse twin',
    steps: [
      ['Lay out the floor', 'Set aisles, bays, pallet levels, inbound and outbound docks and the number of carts. The floor plan, traffic and chargers follow.'],
      ['Load your products', 'Paste your SKUs from Excel or load a CSV: code, name, cases per pallet, kg per case.'],
      ['Name who you serve', 'Customers, destination cities, carriers (one can be express) and inbound suppliers.'],
      ['Connect your ERP', 'Odoo, Salesforce or any webhook receives each confirmed transfer order, sent from your browser.'],
      ['Show your real fleet', 'Point it at your fleet manager’s JSON or WebSocket and map its fields; real carts replace simulated ones.'],
    ],
  },
  {
    kind: 'imports', name: 'Import tracker',
    steps: [
      ['Say where goods go', 'Your company, sourcing agent, warehouse and the agent’s hub, by coordinates.'],
      ['Pick the route', 'Port of loading and arrival, airports and rail terminals between China and Europe.'],
      ['Load your suppliers and orders', 'From a spreadsheet: PO, supplier, goods, units, price, HS code, mode and the dates you have.'],
      ['Use your real dates', 'Today is today; each order sits where its dates put it and an overdue stage pushes the ETA.'],
      ['Feed in the agent’s updates', 'A CSV or a JSON URL with order, status, date and position.'],
    ],
  },
]

export const TWIN_BUILDER_FAQ: { q: string; a: string }[] = [
  { q: 'Is the digital twin builder free?', a: 'Yes. It runs entirely in your browser, with no account and nothing to install.' },
  { q: 'Where is my data stored?', a: 'In your browser. Settings are kept in local storage, exported as a file, or shared as a link whose contents travel in the part of the URL that is never sent to a server. Your ERP key is never put in files or links.' },
  { q: 'Can it connect to my ERP, WMS or fleet manager?', a: 'It calls them straight from your browser: Odoo, Salesforce or any webhook for confirmations, and a JSON or WebSocket feed for cart positions. The system has to allow requests from this site (CORS).' },
  { q: 'Can I track real purchase orders, not a simulation?', a: 'Yes. Load your orders with their dates and turn on real dates: the tracker uses today as the clock, shows which orders are late and by how much, and moves the ETA when a stage is overdue.' },
  { q: 'What file formats does it read?', a: 'CSV from Excel, Google Sheets or an ERP export, comma or semicolon separated, with English or Spanish column names. You can also paste the cells straight from a spreadsheet.' },
]

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
function jsonEsc(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** Plain HTML a crawler can read without running the app. */
function body(): string {
  const parts = STEPS.map((g) => [
    `<h2><a href="${ROUTE}?kind=${g.kind}">${esc(g.name)}</a></h2>`,
    `<ol>${g.steps.map(([h, t]) => `<li><h3>${esc(h)}</h3><p>${esc(t)}</p></li>`).join('')}</ol>`,
  ].join(''))
  return [
    '<main>',
    '<h1>Build your own digital twin</h1>',
    '<p>An AGV warehouse from your layout and products, or an import tracker from your purchase orders. It runs in your browser: nothing is uploaded.</p>',
    ...parts,
    '<h2>Questions</h2>',
    TWIN_BUILDER_FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join(''),
    '<p><a href="/msp-global/">See the live demos</a> · <a href="/agv-digital-twin/">AGV digital twin</a> · <a href="/china-import-tracker/">China import tracker</a> · <a href="/digital-twin-examples/">Digital twin examples</a></p>',
    '</main>',
  ].join('')
}

export function renderTwinBuilderShell(template: string): string {
  const canonical = `${SITE}${ROUTE}`
  const image = `${SITE}${TWIN_BUILDER_SEO.image}`
  const { title, description, keywords, imageAlt } = TWIN_BUILDER_SEO
  let html = template
  const set = (re: RegExp, v: string) => { html = html.replace(re, `$1${v}$2`) }
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  set(/(<meta\s+name="description"\s+content=")[^"]*(")/, esc(description))
  set(/(<meta\s+name="keywords"\s+content=")[^"]*(")/, esc(keywords))
  set(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, esc(canonical))
  set(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, esc(title))
  set(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, esc(description))
  set(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, esc(canonical))
  set(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, esc(image))
  set(/(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/, esc(imageAlt))
  set(/(<meta\s+property="og:image:width"\s+content=")[^"]*(")/, '1600')
  set(/(<meta\s+property="og:image:height"\s+content=")[^"]*(")/, '900')
  set(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, esc(title))
  set(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, esc(description))
  set(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, esc(image))
  set(/(<meta\s+name="twitter:image:alt"\s+content=")[^"]*(")/, esc(imageAlt))
  // The builder's own language set (the localized pages) replaces the home page's.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '')

  const author = { '@type': 'Person', name: 'Joel Benítez', url: 'https://github.com/j03rul4nd' }
  const appLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'Digital Twin Builder',
    url: canonical,
    description,
    image,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Any (web browser)',
    browserRequirements: 'Requires a modern browser with WebGL',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    featureList: STEPS.flatMap((g) => g.steps.map(([h]) => `${g.name}: ${h}`)),
    author,
    publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE },
    inLanguage: 'en',
  }
  const howTo = STEPS.map((g) => ({
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: g.kind === 'agv' ? 'How to build an AGV warehouse twin in the browser' : 'How to build an import tracker in the browser',
    url: `${canonical}?kind=${g.kind}`,
    tool: [{ '@type': 'HowToTool', name: 'A web browser' }],
    supply: g.kind === 'imports' ? [{ '@type': 'HowToSupply', name: 'Your purchase orders as a spreadsheet (CSV)' }] : [{ '@type': 'HowToSupply', name: 'Your product list as a spreadsheet (CSV)' }],
    step: g.steps.map(([h, t], i) => ({ '@type': 'HowToStep', position: i + 1, name: h, text: t, url: `${canonical}?kind=${g.kind}` })),
  }))
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: TWIN_BUILDER_FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
  const injected = [
    builderHreflangs('').split('\n').join('\n  '),
    ...[appLd, ...howTo, faqLd].map((o) => `<script type="application/ld+json">${jsonEsc(JSON.stringify(o))}</script>`),
  ].join('\n  ')
  html = html.replace('</head>', `  ${injected}\n</head>`)
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/, '')
  html = html.replace('<div id="root"></div>', `<div id="root">${body()}</div>`)
  return html
}

export function generateTwinBuilderPage(distDir: string): { pages: number; errors: number } {
  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    console.warn('[twin-builder-page] dist/index.html not found — skipping.')
    return { pages: 0, errors: 0 }
  }
  const html = renderTwinBuilderShell(readFileSync(indexPath, 'utf-8'))
  if (!html.includes('<div id="root"><main>')) {
    console.error('[twin-builder-page] could not find <div id="root"></div> in dist/index.html.')
    return { pages: 0, errors: 1 }
  }
  const out = path.join(distDir, 'twin-builder')
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, 'index.html'), html)
  return { pages: 1, errors: 0 }
}
