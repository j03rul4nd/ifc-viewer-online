/**
 * useSeo — synchronises document meta with the active locale.
 *
 * Call once at the App root. Whenever the user changes language:
 *  - document.title is updated
 *  - <html lang="…"> reflects the new locale (important for screen readers + crawlers)
 *  - <meta name="description"> / og:* / twitter:* are patched in place
 *  - og:locale is updated
 *
 * No third-party library needed: we patch the static tags that already exist
 * in index.html rather than injecting new ones.
 */
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE_META, OG_IMAGE_URL } from './config'
import { SUPPORTED_LOCALES } from '../i18n/config'

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchMeta(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector)
  if (el) el.content = content
}

function patchLink(rel: string, hreflang: string, href: string): void {
  const sel = `link[rel="${rel}"][hreflang="${hreflang}"]`
  let el = document.querySelector<HTMLLinkElement>(sel)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    el.setAttribute('hreflang', hreflang)
    document.head.appendChild(el)
  }
  el.href = href
}

function normaliseLang(raw: string): string {
  const code = raw.split('-')[0]
  return SUPPORTED_LOCALES.includes(code) ? code : 'en'
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSeo(): void {
  const { i18n } = useTranslation()
  const locale   = normaliseLang(i18n.language ?? 'en')
  const meta     = LOCALE_META[locale] ?? LOCALE_META.en

  useEffect(() => {
    // 1. Page title
    document.title = meta.title

    // 2. <html lang="…">
    document.documentElement.lang = locale

    // 3. Primary meta
    patchMeta('meta[name="description"]',           meta.description)

    // 4. Open Graph
    patchMeta('meta[property="og:title"]',          meta.title)
    patchMeta('meta[property="og:description"]',    meta.description)
    patchMeta('meta[property="og:locale"]',         meta.ogLocale)
    patchMeta('meta[property="og:image"]',          OG_IMAGE_URL)

    // 5. Twitter card
    patchMeta('meta[name="twitter:title"]',         meta.title)
    patchMeta('meta[name="twitter:description"]',   meta.twitterDescription ?? meta.description)

    // 6. hreflang alternate links (injected once, href stays the same for all locales
    //    since we're a single-URL SPA with localStorage-based locale detection)
    for (const lang of SUPPORTED_LOCALES) {
      patchLink('alternate', lang, window.location.origin + window.location.pathname)
    }
    patchLink('alternate', 'x-default', window.location.origin + window.location.pathname)

    // 7. Update canonical to strip query/hash (keep it clean)
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (canonical) canonical.href = window.location.origin + window.location.pathname
  }, [locale, meta])
}
