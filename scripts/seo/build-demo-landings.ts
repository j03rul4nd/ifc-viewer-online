// Static landings for the live demos: one page per demo plus two galleries.
//
//   npx tsx scripts/seo/build-demo-landings.ts
//
// Writes public/<slug>/index.html for every page in PAGES. The screenshots are
// real captures of the product and live in public/demos/<file>.jpg (full size)
// and public/demos/<file>-800.jpg (srcset). Each <img> carries a descriptive
// filename, alt text and caption, and each page lists its images as
// schema.org ImageObject with creator and licence, so they can surface in
// image search. scripts/seo/demo-landings.test.ts keeps the image files and
// the sitemap in step with this list.

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { withRights } from './image-metadata'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const SITE = 'https://www.ifcvieweronline.eu'
const AUTHOR = { '@type': 'Person', name: 'Joel Benítez', url: 'https://github.com/j03rul4nd' }
const CONTACT = '/msp-global/#contact'
// Same terms page the blog's images point to (license + acquireLicensePage).
const TERMS = `${SITE}/terms/`
const OWN = 'IFC Viewer Online'
const MAP_CREDIT = `${OWN} · map data © OpenStreetMap contributors (ODbL)`

interface Shot { alt: string; cap: string; credit?: string }

/** Every screenshot: file stem in public/demos/, alt text, caption. */
export const IMAGES: Record<string, Shot> = {
  'agv-warehouse-digital-twin': {
    alt: 'AGV warehouse digital twin: six automated guided vehicles, racks and docks in a live 3D view',
    cap: 'Six AGVs pick, deliver and charge in a live 3D warehouse.',
  },
  'agv-warehouse-digital-twin-phone': {
    alt: 'AGV fleet digital twin open in a phone browser',
    cap: 'The same warehouse twin on a phone. Nothing to install.',
  },
  'china-import-tracker-map': {
    alt: 'Import tracker map: purchase orders from China by sea, air and rail with the orders that need attention',
    cap: 'Every order from China on one map, with what needs you first.',
    credit: MAP_CREDIT,
  },
  'china-import-tracker-phone': {
    alt: 'China import tracking dashboard on a phone with a bottom sheet of late orders',
    cap: 'On a phone: the map, and the late orders underneath.',
    credit: MAP_CREDIT,
  },
  'china-import-order-landed-cost': {
    alt: 'Landed cost of an import order: FOB, freight, duty by HS code, VAT and cost per unit',
    cap: 'Landed cost per order: freight, duty by HS code, cost per unit.',
  },
  'china-import-order-timeline': {
    alt: 'Import order timeline from purchase order to delivery: QC, port, vessel, customs and ETA',
    cap: 'One order, from PO to door: QC, vessel, customs, ETA.',
  },
  'office-it-digital-twin-ifc': {
    alt: 'Office IT digital twin on an IFC building model: Wi-Fi access points, racks, UPS and cameras with live status',
    cap: 'Office IT on the building: access points, racks, UPS, camera, badge reader.',
  },
  'ifc-viewer-hotel-model': {
    alt: 'IFC viewer online showing the architecture, structure and MEP models of a curved hotel tower in 3D',
    cap: 'A hotel tower: architecture, structure and MEP IFC models together.',
  },
  'office-it-digital-twin-phone': {
    alt: 'Office IT digital twin on a phone: the building with device status and what each problem costs',
    cap: 'The office twin on a phone: what is down, and what it costs.',
  },
  'ifc-viewer-hotel-in-city': {
    alt: 'IFC viewer with a hotel BIM model placed in the real 3D city of Barcelona',
    cap: 'A hotel IFC model in the real city, with terrain and buildings around it.',
    credit: MAP_CREDIT,
  },
  'ifc-solar-facade-analysis': {
    alt: 'Solar analysis on an IFC model: a year of sun and heat on every facade from real weather data',
    cap: 'A year of sun and heat on every facade, from real weather records.',
  },
  'ifc-viewer-duplex-house': {
    alt: 'Free online IFC viewer showing the Duplex house IFC2x3 sample model in 3D',
    cap: 'The Duplex house sample (IFC2x3) in the online IFC viewer.',
  },
  'ifc-viewer-japanese-temple': {
    alt: 'IFC viewer showing a Japanese temple IFC model in 3D in the browser',
    cap: 'A Japanese temple IFC model, rendered in the browser.',
  },
  'city-digital-twin-barcelona': {
    alt: 'City digital twin of Barcelona: Plaça de Catalunya with live bikes, chargers and traffic',
    cap: 'Barcelona, Plaça de Catalunya: bikes, chargers and traffic, live.',
    credit: MAP_CREDIT,
  },
  'city-digital-twin-helsinki-transit': {
    alt: 'Helsinki digital twin: central station bus bays updated live as buses arrive',
    cap: 'Helsinki central station: bus bays, live as buses arrive.',
    credit: MAP_CREDIT,
  },
}

const DEMO = (id: string) => `/msp-global/?open=${id}`

interface Page {
  slug: string; title: string; description: string; keywords: string; badge: string
  h1: [string, string]; lead: string; cta: { href: string; label: string }
  images: string[]; points: [string, string][]; faq: [string, string][]
}

export const PAGES: Page[] = [
  {
    slug: 'agv-digital-twin',
    title: 'AGV Digital Twin: Live Warehouse Fleet Demo in 3D',
    description: 'A live digital twin of an AGV warehouse: every vehicle, battery, order and dock in 3D, on any phone. Delivered orders close in your ERP. Try the demo.',
    keywords: 'AGV digital twin, warehouse digital twin, AGV fleet monitoring, AMR fleet dashboard, automated guided vehicle simulation, warehouse 3D visualization, intralogistics digital twin, AGV Odoo integration',
    badge: 'Live demo · Simulated data',
    h1: ['AGV digital twin', 'every cart, live'],
    lead: 'See every automated guided vehicle, its battery, its mission and every dock in one live 3D warehouse. Delivered orders close themselves in your ERP. Opens on any phone.',
    cta: { href: DEMO('agv'), label: 'Open the live AGV demo' },
    images: ['agv-warehouse-digital-twin', 'agv-warehouse-digital-twin-phone'],
    points: [
      ['Every vehicle, live', 'Position, battery and current mission for each AGV or AMR on the floor plan.'],
      ['Orders, end to end', 'From pick to dock. A delivered order is closed in Odoo, Salesforce or your WMS.'],
      ['Bottlenecks at a glance', 'Queues at a dock or a charger show where they happen, not in a table.'],
      ['Any screen', 'A link that opens on a phone, a tablet or a wall screen. Nothing to install.'],
    ],
    faq: [
      ['What is an AGV digital twin?', 'A live 3D model of a warehouse where each automated guided vehicle, rack and dock is shown with its current state: where it is, its battery, what it is carrying and which order it serves.'],
      ['Is the data in the demo real?', 'No. The fleet in the demo is a seeded simulation, marked as such, so it runs without anyone’s private data. A real deployment reads the fleet manager or the vehicles’ own feed.'],
      ['Can it connect to my ERP or WMS?', 'Yes. Order status can flow both ways: orders in from the ERP, delivery confirmations out to Odoo, Salesforce or a WMS. Each integration is set up with the client.'],
    ],
  },
  {
    slug: 'china-import-tracker',
    title: 'China Import Tracker: Every Order From Factory to Door',
    description: 'Track imports from China on one live map: QC, sea, air or rail, customs, landed cost and ETA per order. See what is late and what it costs you. Try the demo.',
    keywords: 'China import tracker, import shipment tracking map, supply chain visibility dashboard, landed cost calculator, purchase order tracking, sourcing agent updates, container tracking, import ETA tracking',
    badge: 'Live demo · Simulated data',
    h1: ['Every order from China', 'on one map'],
    lead: 'Factory, quality check, port, vessel, customs, warehouse. One live map of every purchase order, with what is late, why, and what it costs you.',
    cta: { href: DEMO('imports'), label: 'Open the live import tracker' },
    images: ['china-import-tracker-map', 'china-import-order-timeline', 'china-import-order-landed-cost', 'china-import-tracker-phone'],
    points: [
      ['What needs you, first', 'Late orders and failed inspections at the top, with the cost of each delay.'],
      ['Landed cost per order', 'FOB, freight, duty by HS code and VAT, down to cost per unit.'],
      ['Containers and suppliers', 'Shared containers, fill rate, and a score for each supplier.'],
      ['Your agent’s updates', 'Updates from BuckyDrop or your own sourcing agent, read automatically; receipts sent to your ERP.'],
    ],
    faq: [
      ['Who is this for?', 'Companies that buy from factories in China through a sourcing agent and want one view of every order instead of chats, spreadsheets and forwarder emails.'],
      ['Is the data in the demo real?', 'No. Orders, vessels and suppliers are simulated and marked as such. Routes and ports are real.'],
      ['Does it calculate duties?', 'The demo estimates duty from an HS code and a rate per order. A real setup uses your own tariff data and broker figures.'],
    ],
  },
  {
    slug: 'office-it-digital-twin',
    title: 'Office IT Digital Twin: Wi-Fi, Racks and Cameras on the Plan',
    description: 'A digital twin of an office’s IT on its IFC building model: access points, racks, UPS, cameras and badge readers with live status. For MSPs. Try it.',
    keywords: 'IT digital twin, office digital twin, MSP digital twin, network devices floor plan, IT asset management floor plan, data center visualization, IFC digital twin, building IoT dashboard',
    badge: 'Live demo · Simulated feed',
    h1: ['Office IT digital twin', 'on the building'],
    lead: 'Every access point, rack, UPS, camera and badge reader on the real building model. Red where something is down. A service an MSP can sell to every client site.',
    cta: { href: DEMO('itops'), label: 'Open the live office IT demo' },
    images: ['office-it-digital-twin-ifc', 'office-it-digital-twin-phone'],
    points: [
      ['Devices where they are', 'Tap a device on the plan to read its live status and properties.'],
      ['Alerts with a place', 'A failing access point or a hot rack shows on its floor and room.'],
      ['Built on IFC', 'The building is an open IFC model; the devices are IFC elements with their own property sets.'],
      ['One link per client', 'Share a site with a client or a technician. It opens on any phone.'],
    ],
    faq: [
      ['What is an IT digital twin?', 'A 3D model of a building with its IT equipment placed where it really is, each device showing its live state from monitoring.'],
      ['Where do the devices come from?', 'In the demo they are IFC elements (IfcCommunicationsAppliance and others) in a purpose-built office model. In a real site they come from the building model or are placed by hand.'],
      ['Is the feed real?', 'The demo feed is simulated and marked as such. A real one connects to your RMM or monitoring tool.'],
    ],
  },
  {
    slug: 'ifc-viewer-examples',
    title: 'IFC Viewer Examples: 3D Building Models Online, Free',
    description: 'Screenshots of real IFC models in a free online IFC viewer: houses, offices, a hotel in its city, solar analysis and digital twins. Open each one live.',
    keywords: 'IFC viewer, IFC viewer online, IFC viewer examples, IFC model 3D, IFC sample files, BIM viewer online, view IFC in browser, free IFC viewer screenshots',
    badge: 'Free · In the browser · No upload',
    h1: ['IFC viewer examples', 'real models, live'],
    lead: 'Real IFC models opened in IFC Viewer Online. Every picture on this page is a screenshot of the product, and every model opens live in your browser.',
    cta: { href: '/', label: 'Open the free IFC viewer' },
    images: ['ifc-viewer-hotel-model', 'ifc-solar-facade-analysis', 'ifc-viewer-hotel-in-city', 'ifc-viewer-duplex-house', 'ifc-viewer-japanese-temple', 'office-it-digital-twin-ifc'],
    points: [
      ['IFC2x3, IFC4, IFC4x3', 'Open any IFC file in the browser. Nothing is uploaded.'],
      ['Check and fix', 'A Health Score 0–100, validation rules and IDS checks on the same screen.'],
      ['In its real place', 'Put the model on the real city with terrain, buildings and live data.'],
      ['Share a link', 'Embed a model in a page or send a link that opens on a phone.'],
    ],
    faq: [
      ['Are these real screenshots?', 'Yes. Each image is a capture of IFC Viewer Online with the model named in the caption.'],
      ['Where do the sample models come from?', 'Public sample IFC files (such as the Duplex house) and models built for these demos.'],
      ['Is the IFC viewer free?', 'Yes. Opening, viewing and checking IFC files is free and runs in your browser.'],
    ],
  },
  {
    slug: 'digital-twin-examples',
    title: 'Digital Twin Examples: Live Warehouses, Buildings and Cities',
    description: 'Live digital twin examples to open on a phone: an AGV warehouse, imports from China, office IT on an IFC model, and city squares in Barcelona and Helsinki.',
    keywords: 'digital twin examples, digital twin demo, live digital twin, city digital twin, building digital twin, warehouse digital twin, web digital twin, digital twin use cases',
    badge: 'Live · Any phone · Nothing to install',
    h1: ['Digital twin examples', 'you can open now'],
    lead: 'Warehouses, supply chains, offices and whole city squares. Each example below is live, and each opens in the browser on any phone.',
    cta: { href: '/msp-global/', label: 'Open all live demos' },
    images: ['agv-warehouse-digital-twin', 'china-import-tracker-map', 'office-it-digital-twin-ifc', 'city-digital-twin-barcelona', 'city-digital-twin-helsinki-transit', 'ifc-viewer-hotel-in-city', 'ifc-solar-facade-analysis'],
    points: [
      ['Real places', 'Cities and terrain come from open map data; buildings from IFC models.'],
      ['Live data', 'Bikes, chargers, buses and traffic from public feeds where a city publishes them.'],
      ['Your systems', 'Devices, ERP orders and shipment updates can feed the same view.'],
      ['One link', 'No install, no account. A link that opens on any screen.'],
    ],
    faq: [
      ['What is a digital twin?', 'A model of a real place connected to data that changes, so you see where things are and what state they are in as it happens.'],
      ['Which examples use real data?', 'The city scenes use real public data. The warehouse, import and office IT examples are simulated and marked as such.'],
      ['Can I have one for my business?', 'Yes. Some setups work today; others are built with a first partner as a pilot.'],
    ],
  },
]

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const jsonEsc = (s: string) => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
const imgUrl = (stem: string, small = false) => `/demos/${stem}${small ? '-800' : ''}.jpg`

function figure(stem: string, i: number) {
  const im = IMAGES[stem]
  return `<figure class="shot">
          <img src="${imgUrl(stem)}" srcset="${imgUrl(stem, true)} 800w, ${imgUrl(stem)} 1600w" sizes="(max-width: 900px) 100vw, 852px" width="1600" height="900" alt="${esc(im.alt)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" />
          <figcaption>${esc(im.cap)}</figcaption>
        </figure>`
}

function render(p: Page) {
  const url = `${SITE}/${p.slug}/`
  const hero = `${SITE}${imgUrl(p.images[0])}`
  const others = PAGES.filter((o) => o.slug !== p.slug)
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: p.title,
      description: p.description,
      url,
      inLanguage: 'en',
      primaryImageOfPage: hero,
      author: AUTHOR,
      publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE },
    },
    ...p.images.map((stem) => ({
      '@context': 'https://schema.org',
      '@type': 'ImageObject',
      contentUrl: `${SITE}${imgUrl(stem)}`,
      thumbnailUrl: `${SITE}${imgUrl(stem, true)}`,
      name: IMAGES[stem].cap,
      description: IMAGES[stem].alt,
      width: 1600,
      height: 900,
      creator: AUTHOR,
      creditText: IMAGES[stem].credit ?? OWN,
      copyrightNotice: copyright(stem),
      license: TERMS,
      acquireLicensePage: TERMS,
    })),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ]
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}" />
  <meta name="keywords" content="${esc(p.keywords)}" />
  <meta name="author" content="Joel Benítez" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${url}" />
  <link rel="alternate" hreflang="en" href="${url}" />
  <link rel="alternate" hreflang="x-default" href="${url}" />

  <meta property="og:type" content="website" />
  <meta property="og:url" content="${url}" />
  <meta property="og:title" content="${esc(p.title)}" />
  <meta property="og:description" content="${esc(p.description)}" />
  <meta property="og:site_name" content="IFC Viewer Online" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:image" content="${hero}" />
  <meta property="og:image:width" content="1600" />
  <meta property="og:image:height" content="900" />
  <meta property="og:image:alt" content="${esc(IMAGES[p.images[0]].alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.title)}" />
  <meta name="twitter:description" content="${esc(p.description)}" />
  <meta name="twitter:image" content="${hero}" />

  <link rel="preload" as="image" href="${imgUrl(p.images[0])}" imagesrcset="${imgUrl(p.images[0], true)} 800w, ${imgUrl(p.images[0])} 1600w" imagesizes="(max-width: 900px) 100vw, 852px" />
  <link rel="stylesheet" href="/fonts.css" />
${ld.map((o) => `  <script type="application/ld+json">${jsonEsc(JSON.stringify(o))}</script>`).join('\n')}

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: #0A0A0C; color: #E8E8F0; font-family: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif; min-height: 100vh; line-height: 1.5; }
    a { color: inherit; text-decoration: none; }
    img { max-width: 100%; height: auto; display: block; }
    .container { max-width: 900px; margin: 0 auto; padding: 0 16px; }
    header { border-bottom: 1px solid rgba(255,255,255,0.06); padding: 16px 0; }
    .header-inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .logo { font-size: 14px; font-weight: 600; color: #8B96E9; }
    .nav-cta { font-size: 13px; color: rgba(255,255,255,0.6); padding: 6px 14px; border: 1px solid rgba(255,255,255,0.12); border-radius: 6px; white-space: nowrap; }
    .nav-cta:hover { color: #fff; border-color: rgba(255,255,255,0.3); }
    .hero { padding: 56px 0 32px; text-align: center; background: radial-gradient(58% 50% at 50% -8%, rgba(94,106,210,0.16), transparent 70%); }
    .badge { display: inline-block; background: rgba(94,106,210,0.1); border: 1px solid rgba(94,106,210,0.25); border-radius: 100px; padding: 5px 14px; font-size: 12px; color: #A5AEF0; margin-bottom: 22px; font-weight: 500; }
    h1 { font-size: clamp(2rem, 6vw, 3.1rem); font-weight: 700; line-height: 1.08; letter-spacing: -0.03em; margin-bottom: 18px; }
    .accent { color: #8B96E9; }
    .lead { font-size: 17px; line-height: 1.6; color: rgba(255,255,255,0.62); max-width: 640px; margin: 0 auto 28px; }
    .cta { display: inline-block; background: #5E6AD2; color: #fff; padding: 13px 26px; border-radius: 8px; font-size: 15px; font-weight: 600; }
    .cta:hover { background: #4F5ABF; }
    .shots { display: grid; gap: 28px; padding: 24px 0 8px; }
    .shot img { width: 100%; border-radius: 12px; border: 1px solid rgba(255,255,255,0.08); background: #111216; aspect-ratio: 16 / 9; object-fit: cover; }
    .shot figcaption { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 10px; }
    .section { padding: 48px 0; border-top: 1px solid rgba(255,255,255,0.06); }
    h2 { font-size: clamp(1.35rem, 3vw, 1.8rem); font-weight: 700; letter-spacing: -0.02em; margin-bottom: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 14px; }
    .card { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; padding: 18px; }
    .card h3 { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .card p { font-size: 14px; color: rgba(255,255,255,0.55); line-height: 1.55; }
    .faq { border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; }
    .faq div { padding: 20px 22px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .faq div:last-child { border-bottom: none; }
    .faq h3 { font-size: 15px; font-weight: 600; margin-bottom: 6px; }
    .faq p { font-size: 14px; color: rgba(255,255,255,0.58); line-height: 1.65; }
    .more { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
    .more a { display: block; border: 1px solid rgba(255,255,255,0.07); border-radius: 10px; overflow: hidden; background: rgba(255,255,255,0.03); }
    .more a:hover { border-color: rgba(139,150,233,0.5); }
    .more img { aspect-ratio: 16 / 9; object-fit: cover; width: 100%; }
    .more span { display: block; padding: 10px 12px; font-size: 14px; font-weight: 600; }
    .end { text-align: center; padding: 56px 0 72px; border-top: 1px solid rgba(255,255,255,0.06); }
    .end p { color: rgba(255,255,255,0.55); margin-bottom: 22px; }
    footer { border-top: 1px solid rgba(255,255,255,0.06); padding: 24px 0; text-align: center; font-size: 12px; color: rgba(255,255,255,0.35); }
    footer nav { display: flex; flex-wrap: wrap; gap: 8px 18px; justify-content: center; margin-bottom: 10px; }
    footer a:hover { color: rgba(255,255,255,0.7); }
  </style>
</head>
<body>
  <header>
    <div class="container header-inner">
      <a href="/" class="logo">IFC Viewer Online</a>
      <a href="${p.cta.href}" class="nav-cta">Live demo →</a>
    </div>
  </header>
  <main>
    <section class="hero">
      <div class="container">
        <p class="badge">${esc(p.badge)}</p>
        <h1>${esc(p.h1[0])} <br><span class="accent">${esc(p.h1[1])}</span></h1>
        <p class="lead">${esc(p.lead)}</p>
        <a href="${p.cta.href}" class="cta">${esc(p.cta.label)} →</a>
      </div>
    </section>
    <section class="container shots" aria-label="Screenshots">
        ${p.images.map(figure).join('\n        ')}
    </section>
    <section class="section">
      <div class="container">
        <h2>What you get</h2>
        <div class="grid">
          ${p.points.map(([h, t]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(t)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <h2>Questions</h2>
        <div class="faq">
          ${p.faq.map(([q, a]) => `<div><h3>${esc(q)}</h3><p>${esc(a)}</p></div>`).join('\n          ')}
        </div>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <h2>More live examples</h2>
        <div class="more">
          ${others.map((o) => `<a href="/${o.slug}/"><img src="${imgUrl(o.images[0], true)}" width="800" height="450" alt="${esc(IMAGES[o.images[0]].alt)}" loading="lazy" decoding="async" /><span>${esc(o.h1[0].replace(/^./, (c) => c.toUpperCase()))}</span></a>`).join('\n          ')}
        </div>
      </div>
    </section>
    <section class="end">
      <div class="container">
        <h2>Want this for your business?</h2>
        <p>Built end to end by Joel Benítez. Looking for first clients and partners.</p>
        <a href="${CONTACT}" class="cta">Get in touch →</a>
      </div>
    </section>
  </main>
  <footer>
    <div class="container">
      <nav>
        <a href="/">IFC Viewer Online</a>
        ${PAGES.map((o) => `<a href="/${o.slug}/">${esc(o.h1[0].replace(/^./, (c) => c.toUpperCase()))}</a>`).join('\n        ')}
        <a href="/msp-global/">All live demos</a>
        <a href="/ifc-validator/">IFC Validator</a>
      </nav>
      <p>Screenshots © 2026 Joel Benítez · IFC Viewer Online</p>
    </div>
  </footer>
</body>
</html>
`
}

/** <url> blocks with <image:image> entries, for public/sitemap.xml. */
const copyright = (stem: string) => `© 2026 ${IMAGES[stem].credit ?? OWN}`

export function sitemapBlock(lastmod: string) {
  return PAGES.map((p) => `  <url>
    <loc>${SITE}/${p.slug}/</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
    <xhtml:link rel="alternate" hreflang="en"        href="${SITE}/${p.slug}/" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/${p.slug}/" />
${p.images.map((s) => `    <image:image><image:loc>${SITE}${imgUrl(s)}</image:loc></image:image>`).join('\n')}
  </url>`).join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const p of PAGES) {
    for (const s of p.images) {
      if (!IMAGES[s]) throw new Error(`${p.slug}: no image entry "${s}"`)
      for (const small of [false, true]) {
        const f = path.join(ROOT, 'public', imgUrl(s, small))
        if (!existsSync(f)) throw new Error(`${p.slug}: missing ${f}`)
        // Credit, copyright and licence inside the file, as the ImageObject says.
        writeFileSync(f, withRights(readFileSync(f), {
          creator: OWN, credit: IMAGES[s].credit ?? OWN, copyright: copyright(s),
          webStatement: TERMS, licensorUrl: TERMS, description: IMAGES[s].alt, sourceType: 'screenCapture',
        }))
      }
    }
    const dir = path.join(ROOT, 'public', p.slug)
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'index.html'), render(p))
    console.log(`  ✓ /${p.slug}/ · ${p.images.length} images`)
  }
  // The pages and their images in the sitemap, between markers.
  const sm = path.join(ROOT, 'public/sitemap.xml')
  let xml = readFileSync(sm, 'utf-8')
  if (!xml.includes('xmlns:image=')) xml = xml.replace('xmlns:xhtml="http://www.w3.org/1999/xhtml"', 'xmlns:xhtml="http://www.w3.org/1999/xhtml"\n        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"')
  const block = `  <!-- demo-landings:start (scripts/seo/build-demo-landings.ts) -->\n${sitemapBlock(new Date().toISOString().slice(0, 10))}\n  <!-- demo-landings:end -->\n`
  const re = /  <!-- demo-landings:start[\s\S]*?<!-- demo-landings:end -->\n/
  xml = re.test(xml) ? xml.replace(re, block) : xml.replace('</urlset>', `${block}\n</urlset>`)
  writeFileSync(sm, xml)
}
