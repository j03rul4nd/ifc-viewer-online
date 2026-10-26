// ─── KML / KMZ reader ────────────────────────────────────────────────────────
// Reads the placemarks of a KML (or the doc.kml inside a KMZ) with the folder
// they sit in, their name / description / ExtendedData and their geometry as
// WGS84 lat/lon. Points, lines and polygons (outer + inner rings), also inside
// MultiGeometry. Styles, overlays, models and network links are ignored.
//
// Own tiny XML reader instead of DOMParser: DOMParser does not exist in Web
// Workers (where the hazard run lives), and KML needs nothing beyond elements,
// text, CDATA and entities.

import { unzipSync, strFromU8 } from 'fflate'

export interface LatLon { lat: number; lon: number }

export type KmlGeometry =
  | { type: 'point'; point: LatLon }
  | { type: 'line'; line: LatLon[] }
  | { type: 'polygon'; outer: LatLon[]; holes: LatLon[][] }

export interface KmlPlacemark {
  name: string
  description: string
  /** Names of the enclosing folders / documents, outermost first. */
  folders: string[]
  data: Record<string, string>
  geometries: KmlGeometry[]
}

interface XmlNode { tag: string; attrs: Record<string, string>; children: XmlNode[]; text: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decode = (s: string): string => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
  if (e[0] === '#') {
    const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
    return Number.isFinite(code) ? String.fromCodePoint(code) : m
  }
  return ENTITIES[e] ?? m
})

/** Local name without namespace prefix, lower-cased. */
const local = (tag: string): string => tag.slice(tag.indexOf(':') + 1).toLowerCase()

function parseXml(xml: string): XmlNode {
  const root: XmlNode = { tag: '#root', attrs: {}, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let i = 0
  while (i < xml.length) {
    const lt = xml.indexOf('<', i)
    if (lt < 0) break
    if (lt > i) stack[stack.length - 1].text += decode(xml.slice(i, lt))
    if (xml.startsWith('<!--', lt)) { i = end(xml.indexOf('-->', lt), 3); continue }
    if (xml.startsWith('<![CDATA[', lt)) {
      const e = xml.indexOf(']]>', lt)
      stack[stack.length - 1].text += xml.slice(lt + 9, e < 0 ? xml.length : e)
      i = end(e, 3)
      continue
    }
    if (xml[lt + 1] === '?' || xml[lt + 1] === '!') { i = end(xml.indexOf('>', lt), 1); continue }
    const gt = xml.indexOf('>', lt)
    if (gt < 0) break
    const body = xml.slice(lt + 1, gt)
    i = gt + 1
    if (body[0] === '/') {
      const tag = local(body.slice(1).trim())
      // Pop to the matching open tag (tolerates unclosed elements).
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].tag === tag) { stack.length = k; break }
      }
      continue
    }
    const selfClosing = body.endsWith('/')
    const inner = body.replace(/\/$/, '').trim()
    const tag = local(inner.split(/\s/)[0])
    const attrs: Record<string, string> = {}
    for (const a of inner.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) attrs[local(a[1])] = decode(a[3] ?? a[4] ?? '')
    const node: XmlNode = { tag, attrs, children: [], text: '' }
    stack[stack.length - 1].children.push(node)
    if (!selfClosing) stack.push(node)
  }
  return root

  function end(at: number, len: number): number { return at < 0 ? xml.length : at + len }
}

const child = (n: XmlNode, tag: string): XmlNode | undefined => n.children.find((c) => c.tag === tag)
const textOf = (n: XmlNode | undefined): string => (n ? (n.text + n.children.map(textOf).join('')).trim() : '')

function coords(n: XmlNode | undefined): LatLon[] {
  const out: LatLon[] = []
  for (const tuple of textOf(n).split(/\s+/)) {
    if (!tuple) continue
    const [lon, lat] = tuple.split(',').map(Number)
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({ lat, lon })
  }
  return out
}

function geometries(n: XmlNode, out: KmlGeometry[]): void {
  for (const c of n.children) {
    if (c.tag === 'point') {
      const p = coords(child(c, 'coordinates'))[0]
      if (p) out.push({ type: 'point', point: p })
    } else if (c.tag === 'linestring' || c.tag === 'linearring') {
      const line = coords(child(c, 'coordinates'))
      if (line.length >= 2) out.push({ type: 'line', line })
    } else if (c.tag === 'polygon') {
      const ring = (b: XmlNode | undefined): LatLon[] => coords(b && child(child(b, 'linearring') ?? b, 'coordinates'))
      const outer = ring(child(c, 'outerboundaryis'))
      const holes = c.children.filter((h) => h.tag === 'innerboundaryis').map(ring).filter((r) => r.length >= 3)
      if (outer.length >= 3) out.push({ type: 'polygon', outer, holes })
    } else if (c.tag === 'multigeometry') {
      geometries(c, out)
    }
  }
}

function extendedData(n: XmlNode): Record<string, string> {
  const out: Record<string, string> = {}
  const walk = (x: XmlNode): void => {
    for (const c of x.children) {
      if (c.tag === 'data' && c.attrs.name) out[c.attrs.name] = textOf(child(c, 'value'))
      else if (c.tag === 'simpledata' && c.attrs.name) out[c.attrs.name] = textOf(c)
      else walk(c)
    }
  }
  const ext = child(n, 'extendeddata')
  if (ext) walk(ext)
  return out
}

export function parseKml(xml: string): KmlPlacemark[] {
  const out: KmlPlacemark[] = []
  const walk = (n: XmlNode, folders: string[]): void => {
    for (const c of n.children) {
      if (c.tag === 'folder' || c.tag === 'document') {
        const name = textOf(child(c, 'name'))
        walk(c, name ? [...folders, name] : folders)
      } else if (c.tag === 'placemark') {
        const g: KmlGeometry[] = []
        geometries(c, g)
        out.push({
          name: textOf(child(c, 'name')),
          description: textOf(child(c, 'description')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
          folders,
          data: extendedData(c),
          geometries: g,
        })
      } else if (c.tag === 'kml' || c.tag === '#root') {
        walk(c, folders)
      }
    }
  }
  walk(parseXml(xml), [])
  return out
}

/** A KMZ is a zip whose main document is doc.kml (or the first .kml at the root). */
export function parseKmz(bytes: Uint8Array): KmlPlacemark[] {
  const files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith('.kml') })
  const names = Object.keys(files)
  const main = names.find((n) => n.toLowerCase() === 'doc.kml')
    ?? names.filter((n) => !n.includes('/')).sort()[0]
    ?? names.sort()[0]
  if (!main) throw new Error('kmz: no .kml inside')
  return parseKml(strFromU8(files[main]))
}

/** Sniffs zip vs text. */
export function parseKmlOrKmz(bytes: Uint8Array): KmlPlacemark[] {
  return bytes[0] === 0x50 && bytes[1] === 0x4b ? parseKmz(bytes) : parseKml(strFromU8(bytes))
}
