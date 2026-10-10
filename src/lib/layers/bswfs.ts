// ─── bswfs ────────────────────────────────────────────────────────────────────
// FMI's WFS "simple" stored queries (Finnish Meteorological Institute open
// data: weather, and the Helsinki region's air quality measured by HSY), read
// in the browser. The answer is a flat list of (place, time, parameter, value)
// triples — BsWfs:BsWfsElement — not features:
//
//   <BsWfs:BsWfsElement>
//     <BsWfs:Location><gml:Point><gml:pos>60.16964 24.93924 </gml:pos></gml:Point></BsWfs:Location>
//     <BsWfs:Time>2026-10-09T23:00:00Z</BsWfs:Time>
//     <BsWfs:ParameterName>NO2_PT1H_avg</BsWfs:ParameterName>
//     <BsWfs:ParameterValue>7.9</BsWfs:ParameterValue>
//   </BsWfs:BsWfsElement>
//
// One station per place, with the LATEST measured value of each parameter:
// "NaN" means not measured / not yet published (the hourly air-quality mean
// can arrive ~40 min late), so a parameter keeps its last real value and the
// time it was measured. `observed_at` is the newest of those.
//
// The simple answer carries coordinates but no station name or id.
//
// Pure. Regex over the text (the format is flat; no XML parser needed).

const ELEMENT = /<(?:\w+:)?BsWfsElement\b[^>]*>([\s\S]*?)<\/(?:\w+:)?BsWfsElement>/g
const POS = /<gml:pos>\s*([-\d.]+)\s+([-\d.]+)\s*<\/gml:pos>/
const tag = (name: string) => new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]*?)\\s*</(?:\\w+:)?${name}>`)
const TIME = tag('Time')
const PARAM = tag('ParameterName')
const VALUE = tag('ParameterValue')

/** Is this an FMI-style "simple" WFS answer? */
export function isBsWfs(text: string): boolean {
  return /BsWfsElement/.test(text.slice(0, 4000))
}

export interface BsWfsStation {
  lat: number
  lon: number
  /** Newest time among the values kept (ISO). */
  observed_at: string | null
  /** Parameter → latest measured value (null when only NaN came). */
  values: Record<string, number | null>
  /** Parameter → when that value was measured. */
  times: Record<string, string>
}

export function parseBsWfs(text: string): BsWfsStation[] {
  const byPlace = new Map<string, BsWfsStation>()
  ELEMENT.lastIndex = 0
  for (let m = ELEMENT.exec(text); m; m = ELEMENT.exec(text)) {
    const body = m[1]
    const pos = POS.exec(body)
    const time = TIME.exec(body)?.[1]
    const param = PARAM.exec(body)?.[1]
    const raw = VALUE.exec(body)?.[1]
    if (!pos || !time || !param) continue
    // gml:pos is "lat lon" here (EPSG:4258 axis order).
    const lat = Number(pos[1])
    const lon = Number(pos[2])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    const key = `${lat},${lon}`
    let st = byPlace.get(key)
    if (!st) { st = { lat, lon, observed_at: null, values: {}, times: {} }; byPlace.set(key, st) }
    const value = raw === undefined || raw === '' || /^nan$/i.test(raw) ? null : Number(raw)
    const measured = value !== null && Number.isFinite(value)
    if (!(param in st.values)) st.values[param] = null
    // Keep the newest MEASURED value; a newer NaN never hides an older number.
    if (measured && (!st.times[param] || time > st.times[param])) {
      st.values[param] = value
      st.times[param] = time
    }
  }
  for (const st of byPlace.values()) {
    const ts = Object.values(st.times)
    st.observed_at = ts.length ? ts.reduce((a, b) => (b > a ? b : a)) : null
  }
  return [...byPlace.values()]
}

/** Stations → GeoJSON points, one property per parameter. */
export function bsWfsToGeoJson(text: string): { type: 'FeatureCollection'; features: unknown[] } {
  return {
    type: 'FeatureCollection',
    features: parseBsWfs(text).map((st) => ({
      type: 'Feature',
      // No id in the answer: the place is the station's identity across refreshes.
      id: `${st.lat.toFixed(5)},${st.lon.toFixed(5)}`,
      properties: { ...st.values, observed_at: st.observed_at },
      geometry: { type: 'Point', coordinates: [st.lon, st.lat] },
    })),
  }
}
