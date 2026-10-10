// ─── ifc-class-label ──────────────────────────────────────────────────────────
// "IFCBUILDINGELEMENTPROXY" → "IfcBuildingElementProxy".
//
// Fragments and web-ifc hand classes over upper-cased, and the schema's own
// spelling is what a BIM professional recognises (and searches for). The words
// below are the ones IFC 4.3 class names are built from; the name is split into
// them, longest first. A class built from words not listed here comes back
// title-cased as one word ("Ifcfoo"), never wrong-cased mid-word.

const WORDS = [
  'ACCESSORY', 'ACTUATOR', 'ADVANCED', 'AIR', 'ALARM', 'ALIGNMENT', 'ANNOTATION', 'APPLIANCE', 'ARCHITECTURAL', 'ASSEMBLY',
  'AUDIO', 'BAR', 'BEAM', 'BEARING', 'BOILER', 'BOREHOLE', 'BRIDGE', 'BUILDING', 'BURNER', 'CABLE', 'CAISSON', 'CARRIER',
  'CASE', 'CHILLER', 'CHIMNEY', 'CIVIL', 'COIL', 'COLUMN', 'COMMUNICATIONS', 'COMPRESSOR', 'CONDENSER', 'CONTROL',
  'CONTROLLER', 'CONVEYOR', 'COOLED', 'COOLING', 'COURSE', 'COVERING', 'CURTAIN', 'DAMPER', 'DEEP', 'DISCRETE',
  'DISTRIBUTION', 'DOOR', 'DUCT', 'EARTHWORKS', 'ELECTRIC', 'ELEMENT', 'ELEMENTED', 'ELEMENTS', 'ENERGY', 'ENGINE',
  'EVAPORATIVE', 'EVAPORATOR', 'EXCHANGER', 'FAN', 'FASTENER', 'FEATURE', 'FILL', 'FILTER', 'FIRE', 'FITTING', 'FIXTURE',
  'FLIGHT', 'FLOW', 'FOOTING', 'FURNISHING', 'FURNITURE', 'GENERATOR', 'GEOGRAPHIC', 'GEOMODEL', 'GEOSLICE',
  'GEOTECHNIC', 'GEOTECHNICAL', 'GRID', 'HEAT', 'HUMIDIFIER', 'IMPACT', 'INTERCEPTOR', 'JUNCTION', 'KERB', 'LAMP',
  'LIGHT', 'LINEAR', 'LIQUID', 'MARINE', 'MECHANICAL', 'MEDICAL', 'MEMBER', 'METER', 'MOBILE', 'MOORING', 'MOTOR',
  'NAVIGATIONAL', 'OPENING', 'OUTLET', 'PART', 'PAVEMENT', 'PILE', 'PIPE', 'PLATE', 'PORT', 'POSITIONING', 'PROTECTIVE',
  'PROXY', 'PUMP', 'RAIL', 'RAILING', 'RAILWAY', 'RAMP', 'REINFORCED', 'REINFORCING', 'REINFORCEMENT', 'ROAD', 'ROOF',
  'SANITARY', 'SEGMENT', 'SENSOR', 'SHADING', 'SIGN', 'SIGNAL', 'SITE', 'SLAB', 'SOLAR', 'SPACE', 'SPACE', 'STACK',
  'STAIR', 'STANDARD', 'STORAGE', 'STOREY', 'STRUCTURAL', 'SUBTRACTION', 'SURFACE', 'SWITCHING', 'SYSTEM', 'TANK',
  'TENDON', 'TERMINAL', 'TRACK', 'TRANSFORMER', 'TRANSPORT', 'TREATMENT', 'TUBE', 'TUNNEL', 'UNIT', 'UNITARY', 'VALVE',
  'VEHICLE', 'VIBRATION', 'VIRTUAL', 'VISUAL', 'VOIDING', 'WALL', 'WASTE', 'WINDOW', 'WORK', 'WORKS', 'EQUIPMENT',
  'BUILT', 'ELEMENT', 'COMPONENT', 'BRACKET', 'CONSTRUCTION', 'PRODUCT', 'MATERIAL', 'TYPE', 'STYLE', 'LINING', 'PANEL',
  'ISOLATOR', 'DAMPING', 'CHAMBER', 'SYSTEMS', 'GEOGRAPHIC', 'BUILDINGELEMENT',
].filter((w, i, a) => a.indexOf(w) === i && w !== 'BUILDINGELEMENT').sort((a, b) => b.length - a.length)

const cap = (w: string): string => w.charAt(0) + w.slice(1).toLowerCase()

/** Best split of `s` into listed words (fewest words), or null when it cannot be split. */
function split(s: string): string[] | null {
  const best: Array<string[] | null> = new Array(s.length + 1).fill(null)
  best[0] = []
  for (let i = 0; i < s.length; i++) {
    const prev = best[i]
    if (!prev) continue
    for (const w of WORDS) {
      if (!s.startsWith(w, i)) continue
      const next = [...prev, w]
      const cur = best[i + w.length]
      if (!cur || next.length < cur.length) best[i + w.length] = next
    }
  }
  return best[s.length]
}

export function ifcClassLabel(raw: string | null | undefined): string {
  if (!raw) return ''
  const up = raw.trim().toUpperCase()
  if (!up.startsWith('IFC')) return raw
  const body = up.slice(3)
  if (!body) return 'Ifc'
  const words = split(body)
  return 'Ifc' + (words ? words.map(cap).join('') : cap(body))
}
