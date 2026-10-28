// ── Static shell for /msp-global ──────────────────────────────────────────────
//
// /msp-global began as the page behind the MSP GLOBAL 2026 QR and stays as the
// home of the live digital twin demos. Served from the root shell it was
// noindex (the soft-404 guard did not know it) and carried the IFC viewer's
// title and a canonical pointing at "/".
//
// This writes dist/msp-global/index.html: a copy of dist/index.html with its own
// head (title, description, canonical, OG card, WebPage + FAQPage JSON-LD) and a
// plain-HTML summary inside #root that crawlers without JavaScript can read.
// React replaces it on mount, so visitors only ever see the app.
//
// Invoked from vite.config.ts (closeBundle).

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')
const ROUTE = '/msp-global/'

// Google shows about 60 characters of a title and 160 of a description.
export const MSP_SEO = {
  title: 'Live Digital Twin Demos: Warehouse AGVs, Imports, Office IT',
  description:
    'Open live digital twins on any phone, no install: an AGV warehouse, imports from China on one map, an office IT twin and real 3D cities. Try them now.',
  keywords:
    'digital twin demo, live digital twin, warehouse digital twin, AGV digital twin, AGV fleet monitoring, import shipment tracking map, China import tracker, digital twin for MSP, IT asset floor plan, building digital twin, city digital twin, web digital twin',
  image: '/msp-global/hero-poster.jpg',
  imageAlt: 'Live digital twin of a warehouse with AGVs, open in a phone browser',
}

const DEMOS: { name: string; open: string; text: string }[] = [
  { name: 'Warehouse AGV digital twin', open: 'agv', text: 'Six AGVs pick, deliver and charge in a live warehouse. Delivered orders close themselves in the ERP (Odoo, Salesforce or a WMS). Simulated data.' },
  { name: 'Import tracker for goods from China', open: 'imports', text: 'Every purchase order on one map, from the factory to the warehouse: quality checks, sea, air or rail, customs, landed cost and ETA. Simulated data.' },
  { name: 'Office IT digital twin', open: 'itops', text: 'A two-floor office with its Wi-Fi access points, racks, UPS, camera and badge reader on the building model. Red when something is down. Simulated feed.' },
  { name: 'Building in its real city', open: 'hotel', text: 'A building model placed on the real 3D city, with live bikes, chargers and traffic around it.' },
  { name: 'Solar and heat on every facade', open: 'solar', text: 'A year of sun and heat on every facade, from real weather records.' },
  { name: 'Live transit around a site', open: 'helsinki', text: 'A station and its bus bays, updated as buses arrive.' },
]

export const MSP_FAQ: { q: string; a: string }[] = [
  {
    q: 'What is a live digital twin?',
    a: 'A 3D model of a real place (a building, a warehouse, a city block) connected to data that changes: sensors, devices, vehicles or orders. You see where things are and what state they are in, as it happens.',
  },
  {
    q: 'Do I need to install anything to open these demos?',
    a: 'No. Every demo opens in the browser, on a phone, tablet or computer. Nothing to install and no account.',
  },
  {
    q: 'Is the data real?',
    a: 'The maps, buildings and city data are real public data. The warehouse, import and office IT feeds are simulated and marked as such, so the demos run without anyone’s private data.',
  },
  {
    q: 'Can this connect to my own systems?',
    a: 'Yes. Devices, ERP orders (Odoo, Salesforce or a WMS), shipment updates from a sourcing agent and building models in IFC can feed the same view. Some connections work today; others are built with a first partner as a pilot.',
  },
  {
    q: 'Who builds it?',
    a: 'Joel Benítez, a full-stack developer working on digital twins, BIM and GIS on the web. The demos were first shown at MSP GLOBAL 2026.',
  },
]

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function jsonEsc(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

/** Plain HTML a crawler can read without running the app. */
function body(): string {
  const demos = DEMOS.map((d) =>
    `<li><h3><a href="${ROUTE}?open=${d.open}">${esc(d.name)}</a></h3><p>${esc(d.text)}</p></li>`).join('')
  const faq = MSP_FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('')
  return [
    '<main>',
    '<h1>Live digital twins of every site and shipment</h1>',
    '<p>One link. Any phone. Nothing to install. Open a live demo below.</p>',
    '<h2>Live demos</h2>',
    `<ul>${demos}</ul>`,
    '<h2>Questions</h2>',
    faq,
    '<h2>Read more</h2>',
    '<ul><li><a href="/agv-digital-twin/">AGV digital twin</a></li><li><a href="/china-import-tracker/">China import tracker</a></li><li><a href="/office-it-digital-twin/">Office IT digital twin</a></li><li><a href="/digital-twin-examples/">Digital twin examples</a></li><li><a href="/ifc-viewer-examples/">IFC viewer examples</a></li><li><a href="/twin-builder/">Build your own digital twin</a></li></ul>',
    `<p><a href="${ROUTE}#contact">Want this for your business? Get in touch.</a></p>`,
    '</main>',
  ].join('')
}

export function renderMspShell(template: string): string {
  const canonical = `${SITE}${ROUTE}`
  const image = `${SITE}${MSP_SEO.image}`
  const { title, description, keywords, imageAlt } = MSP_SEO
  let html = template

  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(description)}$2`)
  html = html.replace(/(<meta\s+name="keywords"\s+content=")[^"]*(")/, `$1${esc(keywords)}$2`)
  html = html.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${esc(canonical)}$2`)
  html = html.replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${esc(title)}$2`)
  html = html.replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${esc(description)}$2`)
  html = html.replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${esc(canonical)}$2`)
  html = html.replace(/(<meta\s+property="og:image"\s+content=")[^"]*(")/, `$1${esc(image)}$2`)
  html = html.replace(/(<meta\s+property="og:image:alt"\s+content=")[^"]*(")/, `$1${esc(imageAlt)}$2`)
  html = html.replace(/(<meta\s+property="og:image:width"\s+content=")[^"]*(")/, '$11120$2')
  html = html.replace(/(<meta\s+property="og:image:height"\s+content=")[^"]*(")/, '$1630$2')
  html = html.replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${esc(title)}$2`)
  html = html.replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${esc(description)}$2`)
  html = html.replace(/(<meta\s+name="twitter:image"\s+content=")[^"]*(")/, `$1${esc(image)}$2`)
  html = html.replace(/(<meta\s+name="twitter:image:alt"\s+content=")[^"]*(")/, `$1${esc(imageAlt)}$2`)

  // English only: self-referencing hreflang instead of the home page's set.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')
  // The root shell describes the IFC viewer app; this page is something else.
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '')

  const pageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    description,
    url: canonical,
    inLanguage: 'en',
    image,
    about: ['Digital twin', 'Automated guided vehicle', 'Supply chain visibility', 'IT asset management', 'Building information modeling'],
    author: { '@type': 'Person', name: 'Joel Benítez', url: 'https://github.com/j03rul4nd', jobTitle: 'Full-stack developer, digital twins' },
    publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE },
    hasPart: DEMOS.map((d) => ({ '@type': 'WebPageElement', name: d.name, description: d.text, url: `${canonical}?open=${d.open}` })),
  }
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: MSP_FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
  const injected = [
    `<link rel="alternate" hreflang="en" href="${esc(canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${esc(canonical)}" />`,
    `<script type="application/ld+json">${jsonEsc(JSON.stringify(pageLd))}</script>`,
    `<script type="application/ld+json">${jsonEsc(JSON.stringify(faqLd))}</script>`,
  ].join('\n  ')
  html = html.replace('</head>', `  ${injected}\n</head>`)
  // The root shell's <noscript> pitches the IFC viewer with its own <h1>.
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/, '')
  html = html.replace('<div id="root"></div>', `<div id="root">${body()}</div>`)
  return html
}

export function generateMspPage(distDir: string): { pages: number; errors: number } {
  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) {
    console.warn('[msp-page] dist/index.html not found — skipping.')
    return { pages: 0, errors: 0 }
  }
  const html = renderMspShell(readFileSync(indexPath, 'utf-8'))
  if (!html.includes('<div id="root"><main>')) {
    console.error('[msp-page] could not find <div id="root"></div> in dist/index.html.')
    return { pages: 0, errors: 1 }
  }
  const out = path.join(distDir, 'msp-global')
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, 'index.html'), html)
  return { pages: 1, errors: 0 }
}
