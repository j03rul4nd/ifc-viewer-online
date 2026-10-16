// ─── Pricing preview gate ─────────────────────────────────────────────────────
// The paid plans are not on sale yet. The pricing section and the post-score
// upsell are only visible to the team: either the build enables them
// (`VITE_FEATURE_PRICING=true|1`), or someone opens any page with
// `?preview=pricing` once — remembered for the tab in sessionStorage so the
// SPA's own navigations keep it. `?preview=off` clears it. Nothing links here,
// so crawlers and visitors never see it.

const STORAGE_KEY = 'ifc:preview-pricing'

export function isPricingPreview(
  search: string = typeof location !== 'undefined' ? location.search : '',
): boolean {
  const v = import.meta.env.VITE_FEATURE_PRICING as string | undefined
  if (v === 'true' || v === '1') return true

  const param = new URLSearchParams(search).get('preview')
  try {
    if (param === 'pricing') sessionStorage.setItem(STORAGE_KEY, '1')
    else if (param === 'off') sessionStorage.removeItem(STORAGE_KEY)
    return sessionStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    // Storage blocked (private mode, sandboxed iframe): the URL alone decides.
    return param === 'pricing'
  }
}
