/**
 * Images drawn once per language.
 *
 * A diagram with English labels on the Spanish page is a picture a Spanish
 * reader cannot read, and to Google Images it is one file shared by ten pages,
 * which only one of them gets credit for. So the signature diagrams are drawn
 * in each language, next to the English file:
 *
 *   blog/images/urban-digital-twin-anatomy.png        ← English, and the src every pack keeps
 *   blog/images/urban-digital-twin-anatomy-es.png     ← Spanish
 *   blog/images/urban-digital-twin-anatomy-es-800.png ← its 800 px cut
 *
 * The block keeps the English `src` in every language — the packs stay
 * structurally identical to the original — and `localized` says which
 * languages have their own file (`true`: all of them).
 */
export function localizedSrc(src: string, localized: boolean | readonly string[] | undefined, lang: string): string {
  if (!localized || lang === 'en') return src
  if (Array.isArray(localized) && !localized.includes(lang)) return src
  return src.replace(/(-800)?(\.[a-z0-9]+)$/i, `-${lang}$1$2`)
}
