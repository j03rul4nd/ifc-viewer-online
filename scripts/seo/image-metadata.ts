/**
 * Rights metadata inside the blog's image files (IPTC Photo Metadata, as XMP).
 *
 * Google Images reads five fields from the file itself — Creator, Credit Line,
 * Copyright Notice, Web Statement of Rights and Licensor URL — and shows the
 * "Licensable" label from them; it also reads Digital Source Type to label
 * AI-generated pictures. The structured data on the page says the same, but
 * only the file travels when an image is downloaded, re-shared or found by
 * Lens on another site — and then the file is all that names us.
 *
 * Written at build time into dist/ (generateBlogPages), so the committed
 * images stay as rendered and the metadata always matches the posts. Plain
 * byte surgery: an XMP APP1 segment in JPEG, an iTXt chunk in PNG; any
 * previous XMP packet is replaced, so stamping twice changes nothing.
 */

export interface ImageRights {
  /** Who made it: "IFC Viewer Online", or the third party in the credit. */
  creator: string
  /** The full credit line, attributions included. */
  credit: string
  /** "© 2026 IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)" */
  copyright: string
  /** Where the terms of use live (Web Statement of Rights). */
  webStatement: string
  /** Where to ask for a licence (Licensor URL). */
  licensorUrl: string
  /** What the picture shows — the caption or alt text. */
  description: string
  /**
   * How it was made (IPTC Digital Source Type): a capture of the viewer, a
   * diagram or render drawn by us, or a generative model's — the last is the
   * one Google labels. Omitted when we do not know (a third party's image).
   */
  sourceType?: DigitalSourceType
}

export type DigitalSourceType = 'screenCapture' | 'digitalCreation' | 'trainedAlgorithmicMedia'

const XMP_NS = 'http://ns.adobe.com/xap/1.0/\0'
const SOURCE_TYPES = 'http://cv.iptc.org/newscodes/digitalsourcetype/'

function xml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** The XMP packet: IPTC Core/Extension properties in their standard XMP homes. */
export function buildXmp(r: ImageRights): string {
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '  <rdf:Description rdf:about=""',
    '    xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"',
    '    xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"',
    '    xmlns:plus="http://ns.useplus.org/ldf/xmp/1.0/"',
    '    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"',
    `    photoshop:Credit="${xml(r.credit)}"`,
    `    xmpRights:WebStatement="${xml(r.webStatement)}"`,
    '    xmpRights:Marked="True"' + (r.sourceType ? `\n    Iptc4xmpExt:DigitalSourceType="${SOURCE_TYPES}${r.sourceType}">` : '>'),
    `   <dc:creator><rdf:Seq><rdf:li>${xml(r.creator)}</rdf:li></rdf:Seq></dc:creator>`,
    `   <dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xml(r.copyright)}</rdf:li></rdf:Alt></dc:rights>`,
    `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xml(r.description)}</rdf:li></rdf:Alt></dc:description>`,
    `   <plus:Licensor><rdf:Seq><rdf:li rdf:parseType="Resource"><plus:LicensorURL>${xml(r.licensorUrl)}</plus:LicensorURL></rdf:li></rdf:Seq></plus:Licensor>`,
    '  </rdf:Description>',
    ' </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].join('\n')
}

// ── JPEG ─────────────────────────────────────────────────────────────────────

/**
 * The JPEG with `xmp` as its only XMP APP1 segment, placed after the JFIF/EXIF
 * application segments at the head of the file. Everything else is copied
 * byte for byte; from the first non-APPn marker on, the file is untouched.
 */
export function withXmpJpeg(jpeg: Uint8Array, xmp: string): Uint8Array {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('not a JPEG')
  const payload = Buffer.concat([Buffer.from(XMP_NS, 'latin1'), Buffer.from(xmp, 'utf8')])
  if (payload.length + 2 > 0xffff) throw new Error('XMP packet too large for one APP1 segment')
  const segment = Buffer.alloc(4 + payload.length)
  segment[0] = 0xff
  segment[1] = 0xe1
  segment.writeUInt16BE(payload.length + 2, 2)
  payload.copy(segment, 4)

  const head: Buffer[] = [Buffer.from([0xff, 0xd8])]
  let at = 2
  let inserted = false
  while (at + 4 <= jpeg.length && jpeg[at] === 0xff) {
    const marker = jpeg[at + 1]
    const isApp = marker >= 0xe0 && marker <= 0xef
    if (!isApp) break
    const len = (jpeg[at + 2] << 8) | jpeg[at + 3]
    const seg = Buffer.from(jpeg.subarray(at, at + 2 + len))
    const isXmp = marker === 0xe1 && Buffer.from(jpeg.subarray(at + 4, at + 4 + XMP_NS.length)).toString('latin1') === XMP_NS
    // APP0 (JFIF) and APP1 (EXIF) must stay first; ours goes after them.
    if (!inserted && marker !== 0xe0 && !(marker === 0xe1 && !isXmp)) {
      head.push(segment)
      inserted = true
    }
    if (!isXmp) head.push(seg)
    at += 2 + len
  }
  if (!inserted) head.push(segment)
  return Buffer.concat([...head, Buffer.from(jpeg.subarray(at))])
}

// ── PNG ──────────────────────────────────────────────────────────────────────

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const XMP_KEYWORD = 'XML:com.adobe.xmp'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** The PNG with `xmp` as its only XMP iTXt chunk, right after IHDR. */
export function withXmpPng(png: Uint8Array, xmp: string): Uint8Array {
  if (!Buffer.from(png.subarray(0, 8)).equals(PNG_SIG)) throw new Error('not a PNG')
  // keyword \0, compression flag 0, method 0, language "" \0, translated keyword "" \0, text
  const data = Buffer.concat([Buffer.from(`${XMP_KEYWORD}\0\0\0\0\0`, 'latin1'), Buffer.from(xmp, 'utf8')])
  const ours = pngChunk('iTXt', data)
  const parts: Buffer[] = [PNG_SIG]
  let at = 8
  while (at + 12 <= png.length) {
    const len = Buffer.from(png.subarray(at, at + 4)).readUInt32BE(0)
    const type = Buffer.from(png.subarray(at + 4, at + 8)).toString('latin1')
    const chunk = Buffer.from(png.subarray(at, at + 12 + len))
    const isXmp = type === 'iTXt'
      && Buffer.from(png.subarray(at + 8, at + 8 + XMP_KEYWORD.length + 1)).toString('latin1') === `${XMP_KEYWORD}\0`
    if (!isXmp) parts.push(chunk)
    if (type === 'IHDR') parts.push(ours)
    at += 12 + len
    if (type === 'IEND') break
  }
  return Buffer.concat(parts)
}

/** The XMP packet in a JPEG or PNG, if it has one — for tests and checks. */
export function readXmp(file: Uint8Array): string | null {
  const text = Buffer.from(file).toString('utf8')
  const start = text.indexOf('<x:xmpmeta')
  const end = text.indexOf('</x:xmpmeta>')
  return start >= 0 && end > start ? text.slice(start, end + '</x:xmpmeta>'.length) : null
}

/** What a file really is, from its first bytes — an extension can lie. */
export function imageFormat(file: Uint8Array): 'jpeg' | 'png' | 'other' {
  if (file[0] === 0xff && file[1] === 0xd8 && file[2] === 0xff) return 'jpeg'
  if (Buffer.from(file.subarray(0, 8)).equals(PNG_SIG)) return 'png'
  return 'other'
}

/** Stamp a JPEG or PNG; anything else is returned unchanged. */
export function withRights(file: Uint8Array, rights: ImageRights): Uint8Array {
  const format = imageFormat(file)
  if (format === 'jpeg') return withXmpJpeg(file, buildXmp(rights))
  if (format === 'png') return withXmpPng(file, buildXmp(rights))
  return file
}
