// ─── landing-pictures ─────────────────────────────────────────────────────────
// The pictures of the generated landings (tool landings, demo landings, twin
// builder): where the files live, how a page draws one and what it tells a
// crawler about it. One place, so a picture can never be on a page and missing
// from the JSON-LD, the sitemap or the disk.
//
// Every picture is a capture of the product running in a browser
// (scripts/seo/landing-captures/capture.cjs), shipped the way the home ships
// its own (scripts/seo/home-images.ts):
//
//   <file>.jpg          the one search engines index; carries the IPTC rights
//   <file>-<w>.webp     what browsers download (srcset)
//
// Plain JavaScript on purpose: generate-tool-landings.mjs and the TypeScript
// generators both import it.

export const SITE = 'https://www.ifcvieweronline.eu'
export const DIR = 'images/landings/'
export const OWN = 'IFC Viewer Online'
export const MAP_CREDIT = `${OWN} · map data © OpenStreetMap contributors (ODbL)`
export const TERMS = `${SITE}/terms/`

/** A window of the app: the tool landings' captures, one set per language. */
export const TOOL_SIZE = { width: 1600, height: 1000 }

const WIDE = { width: 1600, height: 900 }
/** A phone screen at 2×. */
const PHONE = { width: 780, height: 1688 }

/**
 * The pictures the demo landings and the twin builder share across languages:
 * file stem → pixel size, and `map: true` where OpenStreetMap data is on screen
 * (the credit line and the copyright notice then name its contributors).
 */
export const SHARED = {
  'agv-warehouse-digital-twin': WIDE,
  'agv-warehouse-digital-twin-phone': PHONE,
  'china-import-tracker-map': { ...WIDE, map: true },
  'china-import-tracker-phone': { ...PHONE, map: true },
  'china-import-order-landed-cost': WIDE,
  'china-import-order-timeline': WIDE,
  'office-it-digital-twin-ifc': WIDE,
  'office-it-digital-twin-phone': PHONE,
  'ifc-viewer-hotel-model': WIDE,
  'ifc-viewer-hotel-in-city': { ...WIDE, map: true },
  'ifc-solar-facade-analysis': WIDE,
  'ifc-viewer-duplex-house': WIDE,
  'ifc-viewer-japanese-temple': WIDE,
  'city-digital-twin-barcelona': { ...WIDE, map: true },
  'city-digital-twin-helsinki-transit': { ...WIDE, map: true },
  'digital-twin-builder-agv-warehouse': WIDE,
  'digital-twin-builder-import-tracker': { ...WIDE, map: true },
}

/** Widths of the .webp renditions of a picture `width` px wide: half and full. */
export const webpWidths = (width) => [Math.round(width / 2), width]

/** Root-relative path of the indexed .jpg. */
export const jpgPath = (file) => `/${DIR}${file}.jpg`
/** Absolute URL of the indexed .jpg. */
export const jpgUrl = (file) => `${SITE}${jpgPath(file)}`
export const webpPath = (file, w) => `/${DIR}${file}-${w}.webp`
export const srcset = (file, width) => webpWidths(width).map((w) => `${webpPath(file, w)} ${w}w`).join(', ')

/** Every file a picture needs on disk, relative to public/. */
export const filesOf = (file, width) => [`${DIR}${file}.jpg`, ...webpWidths(width).map((w) => `${DIR}${file}-${w}.webp`)]

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * `<picture>`: WebP for browsers, the .jpg as `src`. `eager` is for the one
 * picture on the first screen; the rest load when they are near.
 */
export function pictureHtml({ file, width, height, alt, sizes, eager = false }) {
  const load = eager ? 'fetchpriority="high"' : 'loading="lazy"'
  return `<picture><source type="image/webp" srcset="${srcset(file, width)}" sizes="${sizes}" /><img src="${jpgPath(file)}" width="${width}" height="${height}" alt="${esc(alt)}" ${load} decoding="async" /></picture>`
}

/** Preload of the first picture, in the rendition the browser will pick. */
export function preloadHtml({ file, width, sizes }) {
  return `<link rel="preload" as="image" type="image/webp" imagesrcset="${srcset(file, width)}" imagesizes="${sizes}" fetchpriority="high" />`
}

export const creditOf = (map) => (map ? MAP_CREDIT : OWN)
export const copyrightOf = (map) => `© 2026 ${creditOf(map)}`

/** schema.org ImageObject, saying what the file's own IPTC says. */
export function imageObject({ file, width, height, alt, caption, lang, map = false, primary = false }) {
  const url = jpgUrl(file)
  return {
    '@type': 'ImageObject',
    '@id': `${url}#image`,
    contentUrl: url,
    url,
    width,
    height,
    name: alt,
    caption,
    inLanguage: lang,
    ...(primary ? { representativeOfPage: true } : {}),
    creator: { '@type': 'Organization', name: OWN, url: `${SITE}/` },
    creditText: creditOf(map),
    copyrightNotice: copyrightOf(map),
    license: TERMS,
    acquireLicensePage: TERMS,
  }
}

/** The rights written inside the .jpg (image-metadata.ts `withRights`). */
export function rightsOf({ alt, map = false }) {
  return {
    creator: OWN, credit: creditOf(map), copyright: copyrightOf(map),
    webStatement: TERMS, licensorUrl: TERMS, description: alt, sourceType: 'screenCapture',
  }
}

/** `<image:image>` line of a sitemap `<url>` entry. */
export const sitemapImage = (file) => `    <image:image><image:loc>${jpgUrl(file)}</image:loc></image:image>`

/** Picture paths a landing must not use any more: the folders of the captures these replaced. */
export const RETIRED = /(?:\/|"|\.\.\/)(?:demos|img)\/[a-z0-9-]+\.jpg/
