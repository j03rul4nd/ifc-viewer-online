/** Identity-scoped reference dimensions; never widen every Shanghai footway.
 * Mingzhu ring: Wang Jun's 2010 site report gives 8.5 m overall / 7.5 m clear.
 * https://wangjun.blog.caixin.com/archives/13466
 * Other publications quote 9.7 m; this remains a reference reconstruction.
 */
export function shanghaiBridgeWidth(
  id: number, tags: Record<string, string> | undefined,
  points: ReadonlyArray<{ lat: number; lon: number }>,
): number | undefined {
  if (tags?.width || tags?.highway !== 'footway' || tags.bridge !== 'yes') return undefined
  // Century corridor and Century bridge: alignment matched to the published
  // IFC mall -> Jin Mao -> SWFC route. Dimensions are standard sections,
  // not a claim that local landings or stairs share that width.
  if (id === 328910842 || id === 520629581) {
    if (!points.length || !points.every(p => p.lat > 31.236 && p.lat < 31.241 && p.lon > 121.498 && p.lon < 121.505)) return undefined
    return id === 328910842 ? 9 : 8
  }
  if (id !== 48876367 && tags.wikidata !== 'Q21548977') return undefined
  if (!points.length || !points.every(p => p.lat > 31.239 && p.lat < 31.242 && p.lon > 121.494 && p.lon < 121.498)) return undefined
  return 8.5
}
