// ─── generate-help-pages ──────────────────────────────────────────────────────
// The paid product's help centre: a hub and five short guides per language,
// written as static pages into public/help/ (English) and public/<lang>/help/.
// The product is a preview, so every page is `noindex, nofollow`, stays out of
// the sitemap and llms.txt, and says it is a preview at the top. Copy lives in
// scripts/seo/help/<lang>.ts; the look is the core landings' CSS and the shared
// header and colour tokens from landing-chrome.ts. Never edit the HTML by hand.
//
// Usage: npx tsx scripts/seo/generate-help-pages.ts   (npm run seo:help)

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyChrome } from './landing-chrome'
import { CSS as CORE_CSS } from './generate-core-landings'
import { pricingPath } from '../../src/lib/pricing/pricing-paths'
import { HELP_LANGS, HELP_TOPICS, helpPath, type HelpLang, type HelpTopic } from '../../src/lib/help-paths'
import type { HelpCopy } from './help/types'
import { en } from './help/en'
import { es } from './help/es'
import { de } from './help/de'
import { fr } from './help/fr'
import { pt } from './help/pt'
import { it } from './help/it'
import { ca } from './help/ca'
import { zh } from './help/zh'
import { ja } from './help/ja'
import { th } from './help/th'

export const COPY: Record<HelpLang, HelpCopy> = { en, es, de, fr, pt, it, ca, zh, ja, th }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PUBLIC = join(ROOT, 'public')
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Paragraph text: escaped, with `code` spans. */
const rich = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>')
/** Google shows about 160 characters of a description. */
const clip = (s: string) => (s.length <= 155 ? s : `${s.slice(0, 154).replace(/\s+\S*$/, '')}…`)
const appPath = (l: HelpLang) => (l === 'en' ? '/' : `/${l}/`)

const CSS = `${CORE_CSS}
    .help-note { margin: 0 0 20px; padding: 10px 14px; border: 1px solid var(--border); border-radius: 10px; font-size: 14px; }
    .help-list { list-style: none; padding: 0; margin: 24px 0 0; display: grid; gap: 12px; }
    .help-list a { display: block; padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px; text-decoration: none; }
    .help-list a strong { display: block; font-size: 17px; margin-bottom: 4px; }
    .help-body h2 { font-size: 19px; margin: 28px 0 8px; }
    .help-body p { line-height: 1.65; }
    .help-body code { font-size: 0.92em; padding: 1px 5px; border-radius: 5px; background: var(--surface-2); overflow-wrap: anywhere; }
    .help-nav { margin-top: 36px; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 15px; }
`

function head(l: HelpLang, title: string, desc: string, topic: HelpTopic | null): string {
  const path = helpPath(topic, l)
  return `<!doctype html>
<html lang="${l}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)} · IFC Viewer Online</title>
  <meta name="description" content="${esc(clip(desc))}" />
  <meta name="robots" content="noindex, nofollow" />
  <link rel="canonical" href="https://www.ifcvieweronline.eu${path}" />
${HELP_LANGS.map((x) => `  <link rel="alternate" hreflang="${x}" href="https://www.ifcvieweronline.eu${helpPath(topic, x)}" />`).join('\n')}
  <link rel="alternate" hreflang="x-default" href="https://www.ifcvieweronline.eu${helpPath(topic, 'en')}" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="/fonts.css" />
  <style>${CSS}  </style>
</head>
<body>
  <header>
    <div class="container"><a href="${appPath(l)}" class="nav-cta">IFC Viewer Online</a></div>
  </header>`
}

function foot(l: HelpLang, c: HelpCopy): string {
  return `  <footer>
    <div class="container">
      <div class="links">
        <a href="${appPath(l)}">${esc(c.ui.home)}</a>
        <a href="${helpPath(null, l)}">${esc(c.ui.hub)}</a>
        <a href="${pricingPath(l)}">${esc(c.ui.pricing)}</a>
      </div>
      <p class="copy">IFC Viewer Online © 2026 · MIT</p>
    </div>
  </footer>
</body>
</html>
`
}

export function renderHub(l: HelpLang): string {
  const c = COPY[l]
  return applyChrome(`${head(l, c.ui.hub, c.ui.hubIntro, null)}
  <main>
    <section class="hero">
      <div class="container">
        <h1>${esc(c.ui.hub)}</h1>
        <p class="help-note">${esc(c.ui.preview)}</p>
        <p class="lead">${esc(c.ui.hubIntro)}</p>
        <ul class="help-list">
${HELP_TOPICS.map((t) => `          <li><a href="${helpPath(t, l)}"><strong>${esc(c.topics[t].title)}</strong>${esc(c.topics[t].desc)}</a></li>`).join('\n')}
        </ul>
      </div>
    </section>
  </main>
${foot(l, c)}`)
}

export function renderTopic(t: HelpTopic, l: HelpLang): string {
  const c = COPY[l], p = c.topics[t]
  return applyChrome(`${head(l, p.title, p.desc, t)}
  <main>
    <section class="hero">
      <div class="container help-body">
        <p class="label"><a href="${helpPath(null, l)}">${esc(c.ui.hub)}</a></p>
        <h1>${esc(p.title)}</h1>
        <p class="help-note">${esc(c.ui.preview)}</p>
        <p class="lead">${esc(p.desc)}</p>
${p.sections.map(([h, body]) => `        <h2>${esc(h)}</h2>\n        <p>${rich(body)}</p>`).join('\n')}
        <nav class="help-nav" aria-label="${esc(c.ui.all)}">
${HELP_TOPICS.filter((x) => x !== t).map((x) => `          <a href="${helpPath(x, l)}">${esc(c.topics[x].title)}</a>`).join('\n')}
        </nav>
      </div>
    </section>
  </main>
${foot(l, c)}`)
}

/** Every file this generator writes, path relative to public/. */
export function pages(): { path: string; html: string }[] {
  const out: { path: string; html: string }[] = []
  for (const l of HELP_LANGS) {
    out.push({ path: join(helpPath(null, l).slice(1), 'index.html'), html: renderHub(l) })
    for (const t of HELP_TOPICS) out.push({ path: join(helpPath(t, l).slice(1), 'index.html'), html: renderTopic(t, l) })
  }
  return out
}

function main(): void {
  const all = pages()
  for (const p of all) {
    const file = join(PUBLIC, p.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, p.html)
  }
  console.log(`help-pages: ${all.length} pages (noindex)`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
