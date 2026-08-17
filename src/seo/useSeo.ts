/**
 * useSeo — synchronises document meta with the active locale.
 *
 * Call once at the App root. Whenever the user changes language:
 *  - <html lang="…"> reflects the new locale (important for screen readers + crawlers)
 *  - document.title, <meta name="description">, og:* and twitter:* are patched
 *    in place — but ONLY for locales that have a LOCALE_META entry (EN, ES)
 *
 * No third-party library needed: we patch the static tags that already exist
 * in index.html rather than injecting new ones.
 *
 * What this hook deliberately does NOT do
 * ───────────────────────────────────────
 * It does not touch the hreflang alternates, and it does not overwrite meta for
 * locales it has no copy for. Each language now has its own URL (/ , /es/, /de/,
 * … — see scripts/seo/generate-lang-shells.ts) and the static HTML of each one
 * already declares the correct title, description and a complete reciprocal
 * hreflang cluster. Patching either from the client can only degrade them.
 */
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { LOCALE_META, OG_IMAGE_URL, type LocaleMeta } from './config'
import { SUPPORTED_LOCALES } from '../i18n/config'

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchMeta(selector: string, content: string): void {
  const el = document.querySelector<HTMLMetaElement>(selector)
  if (el) el.content = content
}

function normaliseLang(raw: string): string {
  const code = raw.split('-')[0]
  return SUPPORTED_LOCALES.includes(code) ? code : 'en'
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface SeoOptions {
  /**
   * false = leave document meta alone this render. For routes that own their
   * own title and description (the /ebook handbooks), because this hook lives
   * in App and its effect therefore runs *after* the route component's — so
   * without an opt-out the locale meta always wins the race.
   */
  enabled?: boolean
}

export function useSeo({ enabled = true }: SeoOptions = {}): void {
  const { i18n } = useTranslation()
  const locale   = normaliseLang(i18n.language ?? 'en')
  // Only EN and ES have runtime meta. For the other eight locales the static
  // shell at /<lang>/ already carries correctly translated tags, so falling back
  // to LOCALE_META.en here would overwrite a German <title> with the English one
  // on a document declaring lang="de". Leave those tags alone instead.
  const meta = LOCALE_META[locale] as LocaleMeta | undefined

  useEffect(() => {
    if (!enabled) return

    // <html lang="…"> always tracks the active locale — it is correct for every
    // language, with or without a LOCALE_META entry.
    document.documentElement.lang = locale

    if (meta) {
      // 1. Page title
      document.title = meta.title

      // 2. Primary meta
      patchMeta('meta[name="description"]',         meta.description)

      // 3. Open Graph
      patchMeta('meta[property="og:title"]',        meta.title)
      patchMeta('meta[property="og:description"]',  meta.description)
      patchMeta('meta[property="og:locale"]',       meta.ogLocale)
      patchMeta('meta[property="og:image"]',        OG_IMAGE_URL)

      // 4. Twitter card
      patchMeta('meta[name="twitter:title"]',       meta.title)
      patchMeta('meta[name="twitter:description"]', meta.twitterDescription ?? meta.description)
    }

    // NOTE — the hreflang alternates are deliberately NOT touched here.
    //
    // This used to rewrite every alternate to the current URL, on the assumption
    // (true at the time) that the site was a single-URL SPA whose locale came
    // from localStorage. That assumption died when each language got its own
    // home at /<lang>/: the loop made all ten alternates point at whichever URL
    // was open, so /de/ told Google that English, Spanish, Japanese and the rest
    // all live at /de/ — which invalidates the whole cluster.
    //
    // Every page now ships a correct, reciprocal cluster in its static HTML
    // (index.html, public/es/index.html, and the shells from
    // scripts/seo/generate-lang-shells.ts). That markup is authoritative.

    // Canonical: strip query/hash so share links and UTM params don't fragment
    // the URL. The origin is taken from the tag itself, not from
    // window.location, so a preview or staging host cannot rewrite the canonical
    // to point at itself.
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (canonical) {
      try {
        const declared = new URL(canonical.href)
        canonical.href = declared.origin + window.location.pathname
      } catch {
        /* malformed canonical — leave it as authored */
      }
    }
  }, [locale, meta, enabled])
}
