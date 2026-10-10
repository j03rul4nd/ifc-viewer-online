import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildXmp, crc32, imageFormat, readXmp, withRights, withXmpJpeg, withXmpPng, type ImageRights } from './image-metadata'

const RIGHTS: ImageRights = {
  creator: 'IFC Viewer Online',
  credit: 'IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)',
  copyright: '© 2026 IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)',
  webStatement: 'https://www.ifcvieweronline.eu/terms/',
  licensorUrl: 'https://www.ifcvieweronline.eu/terms/',
  description: 'Plaça de Catalunya "twin" <live> & open data',
}

const PUBLIC = path.resolve(__dirname, '../../public')

/** JPEG segments up to the scan: [marker, length]. */
function jpegSegments(b: Uint8Array): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let at = 2
  while (b[at] === 0xff && b[at + 1] !== 0xda) {
    const len = (b[at + 2] << 8) | b[at + 3]
    out.push([b[at + 1], len])
    at += 2 + len
  }
  return out
}

/** PNG chunks, each with its CRC checked. */
function pngChunks(b: Uint8Array): string[] {
  const buf = Buffer.from(b)
  const out: string[] = []
  let at = 8
  while (at < buf.length) {
    const len = buf.readUInt32BE(at)
    const type = buf.toString('latin1', at + 4, at + 8)
    expect(buf.readUInt32BE(at + 8 + len), `CRC of ${type}`).toBe(crc32(buf.subarray(at + 4, at + 8 + len)))
    out.push(type)
    at += 12 + len
  }
  return out
}

describe('image rights metadata', () => {
  it('the packet carries the five fields Google reads, escaped', () => {
    const xmp = buildXmp(RIGHTS)
    expect(xmp).toContain('<rdf:li>IFC Viewer Online</rdf:li>')
    expect(xmp).toContain('photoshop:Credit="IFC Viewer Online · map data © OpenStreetMap contributors (ODbL)"')
    expect(xmp).toContain('xmpRights:WebStatement="https://www.ifcvieweronline.eu/terms/"')
    expect(xmp).toContain('<plus:LicensorURL>https://www.ifcvieweronline.eu/terms/</plus:LicensorURL>')
    expect(xmp).toContain('© 2026 IFC Viewer Online')
    expect(xmp).toContain('&quot;twin&quot; &lt;live&gt; &amp; open data')
    expect(xmp).not.toContain('DigitalSourceType')
    expect(buildXmp({ ...RIGHTS, sourceType: 'trainedAlgorithmicMedia' })).toContain('Iptc4xmpExt:DigitalSourceType="http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia"')
    expect(buildXmp({ ...RIGHTS, sourceType: 'screenCapture' })).toContain('digitalsourcetype/screenCapture"')
  })

  it('a real JPEG keeps JFIF first, gains one XMP segment, and the scan is untouched', () => {
    const src = readFileSync(path.join(PUBLIC, 'blog/images/barcelona-digital-twin-bicing-800.jpg'))
    const out = withXmpJpeg(src, buildXmp(RIGHTS))
    const segs = jpegSegments(out)
    expect(segs[0][0]).toBe(0xe0)
    expect(segs.filter(([m]) => m === 0xe1)).toHaveLength(1)
    // The compressed picture is the same bytes at the end of both files.
    const tail = 4096
    expect(Buffer.from(out.subarray(out.length - tail)).equals(src.subarray(src.length - tail))).toBe(true)
    expect(readXmp(out)).toContain('IFC Viewer Online')
  })

  it('stamping twice replaces the packet instead of stacking another', () => {
    const src = readFileSync(path.join(PUBLIC, 'blog/images/barcelona-digital-twin-bicing-800.jpg'))
    const once = withXmpJpeg(src, buildXmp(RIGHTS))
    const twice = withXmpJpeg(once, buildXmp({ ...RIGHTS, description: 'second' }))
    expect(jpegSegments(twice).filter(([m]) => m === 0xe1)).toHaveLength(1)
    expect(readXmp(twice)).toContain('second')
    expect(readXmp(twice)).not.toContain('open data')
  })

  it('a real PNG gains one XMP iTXt chunk after IHDR, every CRC valid, stable on restamp', () => {
    const src = readFileSync(path.join(PUBLIC, 'blog/images/ifc-spatial-structure-hierarchy-800.png'))
    const once = withXmpPng(src, buildXmp(RIGHTS))
    const chunks = pngChunks(once)
    expect(chunks[0]).toBe('IHDR')
    expect(chunks[1]).toBe('iTXt')
    expect(chunks.at(-1)).toBe('IEND')
    expect(chunks.filter((c) => c === 'iTXt')).toHaveLength(pngChunks(src).filter((c) => c === 'iTXt').length + 1)
    const twice = withXmpPng(once, buildXmp(RIGHTS))
    expect(Buffer.from(twice).equals(Buffer.from(once))).toBe(true)
  })

  it('goes by the bytes, not the name, and leaves other formats alone', () => {
    const jpeg = readFileSync(path.join(PUBLIC, 'blog/images/barcelona-digital-twin-bicing-800.jpg'))
    expect(imageFormat(jpeg)).toBe('jpeg')
    expect(readXmp(withRights(jpeg, RIGHTS))).toContain('IFC Viewer Online')
    const svg = Buffer.from('<svg/>')
    expect(imageFormat(svg)).toBe('other')
    expect(withRights(svg, RIGHTS)).toBe(svg)
  })
})
