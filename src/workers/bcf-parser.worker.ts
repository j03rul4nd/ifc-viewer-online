// ─── BCF Parser Web Worker ────────────────────────────────────────────────────
// Receives a .bcfzip ArrayBuffer, extracts and parses all BCF 2.1/3.0 topics.
//
// IN  { type: 'parse', id: string, buffer: ArrayBuffer }
// OUT { type: 'done',  id: string, topics: BcfTopic[], version: string }
//     { type: 'error', id: string, message: string }

import { unzipSync, strFromU8 } from 'fflate'
import { viewpointFromBcf } from '../lib/bcf-viewpoint'
import type { BcfTopic, BcfViewpoint, BcfComment } from '../types'

// ── Minimal XML helpers ───────────────────────────────────────────────────────

/** Extract text content of first matching tag. */
function tagText(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(xml)
  return m ? m[1].trim() : ''
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

/**
 * Text as it was before it was written into XML: the five named entities and
 * character references, in one pass so `&amp;lt;` stays `&lt;`. The export
 * escapes every value (xmlEscape in lib/bcf), and other tools do the same.
 */
function xmlUnescape(s: string): string {
  return s.replace(/&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([\da-fA-F]+));/g, (ref, name, dec, hex) => {
    if (name) return ENTITIES[name]
    const code = dec ? parseInt(dec, 10) : parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : ref
  })
}

/** Extract value of an attribute from a tag opening string or full XML block. */
function attr(xml: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`, 'i').exec(xml)
  return m ? xmlUnescape(m[1]) : ''
}

/** Extract all blocks that start with <tag (including attributes) and end with </tag>. */
function tagBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'gi')
  return [...xml.matchAll(re)].map((m) => m[0])
}

/** Extract opening tag string (self-closing or opening). */
function openTag(xml: string, tag: string): string {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>`, 'i').exec(xml)
  return m ? m[0] : ''
}

/**
 * Every outermost <tag> element, self-closing or not: `open` is its start tag
 * (for attr), `body` what it holds ('' when self-closing). Self-closing is how
 * this app, Solibri and BIMcollab write <Component IfcGuid="…" />. Case-sensitive,
 * as XML is: a BCF 3.0 <ViewPoint> holds a <Viewpoint>, and only the P differs.
 * Each ends at its own closing tag, not the first one: a BCF comment is a
 * <Comment Guid="…"> that holds its text in a <Comment>.
 */
function elements(xml: string, tag: string): { open: string; body: string }[] {
  const re = new RegExp(`<(/?)${tag}(?:\\s[^>]*?)?(/?)>`, 'g')
  const found: { open: string; body: string }[] = []
  let depth = 0
  let open = ''
  let start = 0
  for (const m of xml.matchAll(re)) {
    const [token, closing, selfClosing] = m
    if (closing) {
      if (depth > 0 && --depth === 0) found.push({ open, body: xml.slice(start, m.index) })
    } else if (selfClosing) {
      if (depth === 0) found.push({ open: token.slice(0, -2), body: '' })
    } else if (depth++ === 0) {
      open = token.slice(0, -1)
      start = m.index + token.length
    }
  }
  return found
}

/** Text of the first <tag> child, case-sensitive (see elements), entities decoded. */
function childText(xml: string, tag: string): string {
  return xmlUnescape(elements(xml, tag)[0]?.body.trim() ?? '')
}

/**
 * Base64 of a byte array, in chunks: spreading a whole snapshot into one
 * String.fromCharCode call overflows the stack once it is a few hundred KB,
 * which is every real PNG — and fails the whole import with it.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(bin)
}

function parseFloat3(xml: string, tag: string): { x: number; y: number; z: number } | undefined {
  const block = tagText(xml, tag)
  if (!block) return undefined
  const x = parseFloat(tagText(block, 'X'))
  const y = parseFloat(tagText(block, 'Y'))
  const z = parseFloat(tagText(block, 'Z'))
  if (isNaN(x) || isNaN(y) || isNaN(z)) return undefined
  return { x, y, z }
}

// ── Viewpoint parser ──────────────────────────────────────────────────────────

/** A .bcfv as the app holds it: read in IFC world axes, returned in scene axes. */
export function parseViewpoint(vpXml: string, vpGuid: string, snapshotB64?: string): BcfViewpoint {
  const vp: BcfViewpoint = { guid: vpGuid }

  // Perspective camera
  const perspBlock = tagText(vpXml, 'PerspectiveCamera')
  if (perspBlock) {
    vp.cameraPosition  = parseFloat3(perspBlock, 'CameraViewPoint')
    vp.cameraDirection = parseFloat3(perspBlock, 'CameraDirection')
    vp.cameraUp        = parseFloat3(perspBlock, 'CameraUpVector')
    const fov = parseFloat(tagText(perspBlock, 'FieldOfView'))
    if (!isNaN(fov)) vp.fieldOfView = fov
    const ar = parseFloat(tagText(perspBlock, 'AspectRatio'))
    if (!isNaN(ar)) vp.aspectRatio = ar
  }

  // Orthographic camera (fallback)
  if (!vp.cameraPosition) {
    const orthoBlock = tagText(vpXml, 'OrthogonalCamera')
    if (orthoBlock) {
      vp.cameraPosition  = parseFloat3(orthoBlock, 'CameraViewPoint')
      vp.cameraDirection = parseFloat3(orthoBlock, 'CameraDirection')
      vp.cameraUp        = parseFloat3(orthoBlock, 'CameraUpVector')
    }
  }

  // Selected component GUIDs. Only those under <Selection>: 3.0 also lists
  // <Component>s under <Visibility><Exceptions> and <Coloring>, unselected.
  const guids = elements(vpXml, 'Selection')
    .flatMap((selection) => elements(selection.body, 'Component'))
    .map((component) => attr(component.open, 'IfcGuid'))
    .filter(Boolean)
  if (guids.length > 0) vp.componentGuids = guids

  // Clipping planes. The file was read, so "none" is an answer too: opening
  // this viewpoint shows it uncut, as the tool that wrote it did.
  const planes: NonNullable<BcfViewpoint['clippingPlanes']> = []
  for (const planeBlock of tagBlocks(tagText(vpXml, 'ClippingPlanes'), 'ClippingPlane')) {
    const location  = parseFloat3(planeBlock, 'Location')
    const direction = parseFloat3(planeBlock, 'Direction')
    if (location && direction) planes.push({ location, direction })
  }
  vp.clippingPlanes = planes

  if (snapshotB64) vp.snapshotBase64 = snapshotB64

  return viewpointFromBcf(vp)
}

// ── Markup parser ─────────────────────────────────────────────────────────────

function parseMarkup(markupXml: string, topicGuid: string): Omit<BcfTopic, 'viewpoints' | 'source'> {
  const topicBlock = tagText(markupXml, 'Topic')
    || tagText(markupXml, 'bim:Topic')
    || markupXml  // BCF 3.0 may nest differently

  const topicTag = openTag(markupXml, 'Topic') || openTag(markupXml, 'bim:Topic') || ''
  const guid     = attr(topicTag, 'Guid') || topicGuid

  const text = (tag: string) => xmlUnescape(tagText(topicBlock, tag))

  const title    = text('Title')
  const desc     = text('Description')
  const status   = attr(topicTag, 'TopicStatus') || text('TopicStatus')
  const type     = attr(topicTag, 'TopicType')   || text('TopicType')
  const priority = text('Priority')
  const created  = text('CreationDate')
  const author   = text('CreationAuthor')
  const assigned = text('AssignedTo')

  const labels: string[] = []
  const labelsBlock = tagText(markupXml, 'Labels')
  if (labelsBlock) {
    for (const lb of labelsBlock.split(/<\/?Label>/i).filter((_, i) => i % 2 === 1)) {
      if (lb.trim()) labels.push(xmlUnescape(lb.trim()))
    }
  }

  // Comments: beside <Topic> in 2.1, in its <Comments> in 3.0. The text is an
  // inner <Comment>, so each is read from its outer element (see elements).
  const comments: BcfComment[] = elements(markupXml, 'Comment').map(({ open, body }) => ({
    guid:          attr(open, 'Guid') || childText(body, 'Guid') || crypto.randomUUID(),
    date:          childText(body, 'Date'),
    author:        childText(body, 'Author'),
    text:          childText(body, 'Comment'),
    viewpointGuid: attr(elements(body, 'Viewpoint')[0]?.open ?? '', 'Guid') || undefined,
  }))

  return {
    guid,
    title:          title || `Topic ${guid.slice(0, 8)}`,
    description:    desc   || undefined,
    status:         status || undefined,
    topicType:      type   || undefined,
    priority:       priority || undefined,
    creationDate:   created  || undefined,
    creationAuthor: author   || undefined,
    assignedTo:     assigned || undefined,
    labels:         labels.length > 0 ? labels : undefined,
    comments,
  }
}

/** A viewpoint as markup.bcf lists it: its Guid and the files it names. */
interface ViewpointRef { guid: string; file: string; snapshot: string }

/**
 * The viewpoints a markup lists. Each names its .bcfv in <Viewpoint> and its
 * image in <Snapshot>; only the element around them changes:
 *   3.0  <Viewpoints><ViewPoint Guid="…">…</ViewPoint>…</Viewpoints>
 *   2.1  <Viewpoints Guid="…">…</Viewpoints>, one per viewpoint
 * The 3.0 list is itself a <Viewpoints>, so its entries are looked for first.
 */
function markupViewpoints(markupXml: string): ViewpointRef[] {
  const entries = elements(markupXml, 'ViewPoint')
  return (entries.length > 0 ? entries : elements(markupXml, 'Viewpoints')).map(({ open, body }) => ({
    guid:     attr(open, 'Guid'),
    file:     childText(body, 'Viewpoint'),
    snapshot: childText(body, 'Snapshot'),
  }))
}

// ── Main parse function ───────────────────────────────────────────────────────

export function parseBcfZip(buffer: ArrayBuffer): { topics: BcfTopic[]; version: string } {
  const files = unzipSync(new Uint8Array(buffer))

  // Detect version
  let version = '2.1'
  const versionEntry = Object.entries(files).find(([k]) => k.toLowerCase() === 'bcf.version')
  if (versionEntry) {
    const vXml = strFromU8(versionEntry[1])
    const v = attr(openTag(vXml, 'Version'), 'VersionId') || tagText(vXml, 'VersionId')
    if (v) version = v
  }

  // Group files by topic GUID (top-level folder)
  const topicFolders = new Map<string, Map<string, Uint8Array>>()
  for (const [path, data] of Object.entries(files)) {
    const parts = path.split('/')
    if (parts.length < 2) continue
    const guid = parts[0]
    if (!guid || guid.length < 8) continue
    const fileName = parts.slice(1).join('/')
    if (!topicFolders.has(guid)) topicFolders.set(guid, new Map())
    topicFolders.get(guid)!.set(fileName.toLowerCase(), data)
  }

  const topics: BcfTopic[] = []

  for (const [topicGuid, folderFiles] of topicFolders) {
    // Find markup file
    const markupEntry = [...folderFiles.entries()].find(([k]) => k.endsWith('markup.bcf'))
    if (!markupEntry) continue
    const markupXml = strFromU8(markupEntry[1])

    const base = parseMarkup(markupXml, topicGuid)

    // Parse viewpoints referenced in markup. Its Guid is the one comments
    // point at, and it is what pairs a snapshot with its camera.
    const viewpoints: BcfViewpoint[] = []

    for (const { guid: vpGuid, file, snapshot } of markupViewpoints(markupXml)) {
      const vpFile   = file.toLowerCase()
      const snapFile = snapshot.toLowerCase()

      const vpData    = vpFile ? folderFiles.get(vpFile) : undefined
      const snapData  = snapFile ? folderFiles.get(snapFile) : undefined

      let snapshotB64: string | undefined
      if (snapData) {
        const b64 = bytesToBase64(snapData)
        const ext = snapFile.endsWith('.jpg') || snapFile.endsWith('.jpeg') ? 'jpeg' : 'png'
        snapshotB64 = `data:image/${ext};base64,${b64}`
      }

      if (vpData) {
        const vpXml = strFromU8(vpData)
        viewpoints.push(parseViewpoint(vpXml, vpGuid || crypto.randomUUID(), snapshotB64))
      } else if (vpGuid) {
        viewpoints.push({ guid: vpGuid, snapshotBase64: snapshotB64 })
      }
    }

    // Last resort, for a markup that lists no viewpoint we could read: every
    // .bcfv in the folder, with no snapshot or markup Guid to pair it with.
    if (viewpoints.length === 0) {
      for (const [fileName, data] of folderFiles) {
        if (!fileName.endsWith('.bcfv')) continue
        const vpXml = strFromU8(data)
        const vpGuid = attr(openTag(vpXml, 'VisualizationInfo'), 'Guid') || crypto.randomUUID()
        viewpoints.push(parseViewpoint(vpXml, vpGuid))
      }
    }

    topics.push({ ...base, viewpoints, source: 'imported' })
  }

  return { topics, version }
}

// ── Worker message handler ────────────────────────────────────────────────────

interface ParseMessage {
  type:   'parse'
  id:     string
  buffer: ArrayBuffer
}

self.onmessage = (e: MessageEvent<ParseMessage>) => {
  const { type, id, buffer } = e.data
  if (type !== 'parse') return

  try {
    const { topics, version } = parseBcfZip(buffer)
    self.postMessage({ type: 'done', id, topics, version })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    self.postMessage({ type: 'error', id, message: `BCF parse failed: ${msg}` })
  }
}
