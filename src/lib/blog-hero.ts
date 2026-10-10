/**
 * The responsive set a post's hero is drawn from.
 *
 * Captured heroes are published as `<name>-1600x900.<ext>` with an 800 px cut
 * next to them (`<name>-800x450.<ext>`). The SPA's `<img srcset>` and the
 * static page's `<link rel="preload" imagesrcset>` both come from here, so the
 * browser preloads exactly the file it is about to draw — a preload that names
 * a different file downloads the hero twice on a phone.
 */
export function heroSources(heroImage: string): Array<{ src: string; width: number }> {
  const compact = heroImage.replace(/-1600x900(\.[a-z0-9]+)$/i, '-800x450$1')
  return compact === heroImage
    ? [{ src: heroImage, width: 1600 }]
    : [{ src: compact, width: 800 }, { src: heroImage, width: 1600 }]
}

/** The hero spans the page width at every breakpoint. */
export const HERO_SIZES = '100vw'
