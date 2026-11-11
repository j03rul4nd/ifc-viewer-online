// ── What a crawler is told about the home page's pictures ────────────────────
//
// The home is a client-rendered page: its <img> tags exist only after the app
// has run. Google renders it, but the image index, Bing and every link preview
// read the HTML as served. So each home (EN and the nine language shells) also
// states its pictures statically, from the same list the page renders
// (src/components/landing/home-showcase.ts):
//
//   • <noscript> figures, with the alt text in the page's language
//   • ImageObject JSON-LD with creator, credit and licence (what Google Images
//     shows under "Licensable", and the same thing the files' own IPTC says)
//   • <image:image> entries in the sitemap
//   • a preload for the first picture, which is the page's largest paint
//
// EN is written into dist/index.html by the LAST build plugin (vite.config):
// the blog, fix and legal generators use that file as their template, and none
// of this belongs on their pages.

import {
  HERO_IMAGE, HERO_MOBILE, HOME_IMAGE_DIR, SHOT_IMAGES, SHOT_ORDER, SHOWCASE_COPY, type HomeImage,
} from '../../src/components/landing/home-showcase'
import { homeLang } from '../../src/components/landing/home-copy'

const SITE = (process.env.VITE_SITE_URL || 'https://www.ifcvieweronline.eu').replace(/\/$/, '')

const CREDIT = 'IFC Viewer Online · map data © OpenStreetMap contributors'
const COPYRIGHT = '© 2026 IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)'

export interface HomePicture {
  /** Absolute URL of the .jpg — the one that is indexed. */
  url: string
  width: number
  height: number
  alt: string
  /** The visible text next to it on the page. */
  caption: string
  image: HomeImage
}

/** The home's pictures in page order, described in `lang`. */
export function homePictures(lang: string): HomePicture[] {
  const c = SHOWCASE_COPY[homeLang(lang)]
  const of = (image: HomeImage, alt: string, caption: string): HomePicture => ({
    url: `${SITE}/${HOME_IMAGE_DIR}${image.file}.jpg`, width: image.width, height: image.height, alt, caption, image,
  })
  return [
    of(HERO_IMAGE, c.heroAlt, `${c.heroCaption} ${c.heroCaptionPanel}`),
    ...SHOT_ORDER.map((id) => of(SHOT_IMAGES[id], c.shots[id].alt, `${c.shots[id].title}. ${c.shots[id].body}`)),
  ]
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** `<figure>` per picture, for a <noscript> block. */
export function noscriptFigures(lang: string): string {
  return homePictures(lang).map((p) =>
    `<figure><img src="${p.url}" alt="${esc(p.alt)}" width="${p.width}" height="${p.height}" loading="lazy" /><figcaption>${esc(p.caption)}</figcaption></figure>`,
  ).join('\n')
}

/** schema.org ImageObject nodes; the first is the page's primary image. */
export function imageObjects(lang: string): Array<Record<string, unknown>> {
  return homePictures(lang).map((p, i) => ({
    '@type': 'ImageObject',
    '@id': `${p.url}#image`,
    contentUrl: p.url,
    url: p.url,
    width: p.width,
    height: p.height,
    name: p.alt,
    caption: p.caption,
    inLanguage: homeLang(lang),
    ...(i === 0 ? { representativeOfPage: true } : {}),
    creator: { '@type': 'Organization', name: 'IFC Viewer Online', url: `${SITE}/` },
    creditText: CREDIT,
    copyrightNotice: COPYRIGHT,
    license: `${SITE}/terms/`,
    acquireLicensePage: `${SITE}/terms/`,
  }))
}

/** `<image:image>` lines for the home's <url> entry in the sitemap. */
export function sitemapImages(lang: string): string {
  return homePictures(lang).map((p) => `    <image:image><image:loc>${p.url}</image:loc></image:image>`).join('\n')
}

/** Preloads for the first picture: the phone crop under 640 px, the window above. */
export function heroPreloads(base = '/'): string {
  const dir = `${base}${HOME_IMAGE_DIR}`
  const set = HERO_IMAGE.webp.map((w) => `${dir}${HERO_IMAGE.file}-${w}.webp ${w}w`).join(', ')
  return [
    `<link rel="preload" as="image" type="image/webp" href="${dir}${HERO_MOBILE.file}" media="(max-width: 639px)" fetchpriority="high" />`,
    `<link rel="preload" as="image" type="image/webp" imagesrcset="${set}" imagesizes="(max-width: 1240px) 100vw, 1200px" media="(min-width: 640px)" fetchpriority="high" />`,
  ].join('\n    ')
}

/** Escape < > & in JSON so it is safe inside a <script> tag. */
function jsonEsc(s: string): string {
  return s.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
}

const MARK = '<!-- home-images -->'

/**
 * Add the English home's pictures to dist/index.html: preload and JSON-LD in
 * the head, figures in a <noscript>. Idempotent.
 */
export function injectHomeImages(html: string, base = '/'): string {
  if (html.includes(MARK)) return html
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${SITE}/#webpage`,
    url: `${SITE}/`,
    inLanguage: 'en',
    primaryImageOfPage: { '@id': `${homePictures('en')[0].url}#image` },
    image: imageObjects('en'),
  }
  const head = `    ${MARK}\n    ${heroPreloads(base)}\n    <script type="application/ld+json">${jsonEsc(JSON.stringify(ld))}</script>\n  </head>`
  const body = `<noscript>\n${noscriptFigures('en')}\n</noscript>\n</body>`
  return html.replace('</head>', head).replace('</body>', body)
}

/** Add `<image:image>` entries to the home `<url>` blocks of a sitemap. Idempotent. */
export function addHomeImagesToSitemap(xml: string, langs: readonly string[]): string {
  let out = xml
  for (const lang of langs) {
    const loc = `<loc>${SITE}${lang === 'en' ? '/' : `/${lang}/`}</loc>`
    const at = out.indexOf(loc)
    if (at < 0) continue
    const end = out.indexOf('</url>', at)
    if (end < 0 || out.slice(at, end).includes('<image:image>')) continue
    out = `${out.slice(0, end)}${sitemapImages(lang).replace(/^ {4}/, '  ')}\n  ${out.slice(end)}`
  }
  if (!out.includes('xmlns:image=')) {
    out = out.replace('<urlset ', '<urlset xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" ')
  }
  return out
}
