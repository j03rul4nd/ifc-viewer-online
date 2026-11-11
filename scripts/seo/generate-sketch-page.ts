// ── Static shell for /sketch ─────────────────────────────────────────────────
//
// A SPA route gets the root shell: the viewer's title and a canonical pointing at
// "/", so the studio could not be indexed. This writes dist/sketch/index.html with
// its own head and a plain-HTML summary inside #root that React replaces on mount.
// Same mechanism as generate-twin-builder-page.ts. English only, like the shell.

import path from 'path'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')
const ROUTE = '/sketch/'

export const SKETCH_SEO = {
  title: '3D Sketch Studio: Draw in 3D in Your Browser, Free',
  description: 'Draw lines that stay in 3D with a pen or finger, with pressure, layers and filters, over your IFC models if you like. Free in the browser, no account.',
  keywords: '3D sketch, 3D sketching online, draw in 3D, 3D drawing app, sketch over IFC model, 3D redline, concept sketching',
  image: '/blog/images/3d-sketch-twisted-tower-browser-1600x900.jpg',
  imageAlt: 'Twisting tower with a glowing diagrid and the path of the sun, drawn as 3D lines on a black background',
}

export const SKETCH_FAQ: { q: string; a: string }[] = [
  { q: 'Do I need to install anything or make an account?', a: 'No. The studio runs in the browser and keeps your drawing in that browser, on your device. Clearing the browser data can remove it, so export what you want to keep.' },
  { q: 'Can I sketch over my own model?', a: 'Yes. Open an IFC in the viewer and choose View, then 3D sketch. The model stays in your browser and is not modified.' },
  { q: 'Is it a 3D modelling tool?', a: 'No. It makes lines, not solids. It is for working out an idea quickly, before anyone models it.' },
]

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const jsonEsc = (s: string): string => s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

function body(): string {
  return [
    '<main>',
    '<h1>3D sketch studio</h1>',
    `<p>${esc(SKETCH_SEO.description)}</p>`,
    `<img src="${SKETCH_SEO.image}" alt="${esc(SKETCH_SEO.imageAlt)}" width="1600" height="900" />`,
    '<h2>Questions</h2>',
    SKETCH_FAQ.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join(''),
    '<p><a href="/blog/3d-sketching-online-draw-in-3d/">3D sketching online</a> · <a href="/blog/sketch-over-ifc-bim-model-redline/">Sketch over an IFC model</a> · <a href="/blog/digital-twin-infrastructure-concept-sketch/">Sketch a digital twin</a></p>',
    '</main>',
  ].join('')
}

export function renderSketchShell(template: string): string {
  const canonical = `${SITE}${ROUTE}`
  const image = `${SITE}${SKETCH_SEO.image}`
  const { title, description, keywords, imageAlt } = SKETCH_SEO
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
  // The home page's language set and structured data describe the home page.
  html = html.replace(/<link\s+rel="alternate"\s+hreflang="[^"]*"\s+href="[^"]*"\s*\/>\s*/g, '')
  html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>\s*/g, '')
  const appLd = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: '3D Sketch Studio', url: canonical, description, image,
    applicationCategory: 'DesignApplication', operatingSystem: 'Any (web browser)', browserRequirements: 'Requires a modern browser with WebGL',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, publisher: { '@type': 'Organization', name: 'IFC Viewer Online', url: SITE }, inLanguage: 'en',
  }
  const faqLd = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: SKETCH_FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  }
  html = html.replace('</head>', `  ${[appLd, faqLd].map((o) => `<script type="application/ld+json">${jsonEsc(JSON.stringify(o))}</script>`).join('\n  ')}\n</head>`)
  html = html.replace(/<noscript>[\s\S]*?<\/noscript>\s*/, '')
  html = html.replace('<div id="root"></div>', `<div id="root">${body()}</div>`)
  return html
}

export function generateSketchPage(distDir: string): { pages: number; errors: number } {
  const indexPath = path.join(distDir, 'index.html')
  if (!existsSync(indexPath)) return { pages: 0, errors: 0 }
  const html = renderSketchShell(readFileSync(indexPath, 'utf-8'))
  if (!html.includes('<div id="root"><main>')) {
    console.error('[sketch-page] could not find <div id="root"></div> in dist/index.html.')
    return { pages: 0, errors: 1 }
  }
  const out = path.join(distDir, 'sketch')
  mkdirSync(out, { recursive: true })
  writeFileSync(path.join(out, 'index.html'), html)
  return { pages: 1, errors: 0 }
}
