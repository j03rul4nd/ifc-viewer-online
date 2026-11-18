// ─── Minimal image-deck PPTX writer ────────────────────────────────────────────
// A PowerPoint file with one full-slide picture per slide and, over it, the
// slide's text as native, editable text boxes (see text-layer.ts). The OOXML package is
// a zip of a dozen small XML parts; writing them by hand keeps pptxgenjs
// (~400 kB) out of the bundle for what is, here, "put these images on slides".
// The parts are the minimum PowerPoint, Keynote and Google Slides open without a
// repair prompt: presentation, one master, one blank layout, a theme, slides.

import { zipSync } from 'fflate'
import type { FontFamilyKind, TextBlock } from './text-layer'

export interface PptxSlide {
  /** PNG or JPEG bytes. */
  image: Uint8Array
  ext: 'png' | 'jpeg'
  /** Optional speaker-facing alt text for the picture. */
  alt?: string
  /** Editable text laid over the picture, in canvas px of the slide. */
  texts?: TextBlock[]
}

/**
 * Faces every PowerPoint/Keynote install has. The canvas uses Geist and
 * Instrument Serif; shipping those names would silently fall back to Calibri
 * on most machines, which reads worse than a deliberate Arial/Georgia pair.
 */
export const PPTX_FONTS: Record<FontFamilyKind, string> = { sans: 'Arial', serif: 'Georgia', mono: 'Consolas' }

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"'
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const CT = 'application/vnd.openxmlformats-officedocument'

/** Slide size in EMU: 13.333 in wide (PowerPoint's 16:9), height from the ratio. */
export function slideSizeEmu(width: number, height: number): { cx: number; cy: number } {
  const cx = 12192000
  return { cx, cy: Math.round((cx * height) / Math.max(1, width)) }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rels(items: Array<{ id: string; type: string; target: string }>): string {
  return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
    items.map((r) => `<Relationship Id="${r.id}" Type="${REL}/${r.type}" Target="${r.target}"/>`).join('')
  }</Relationships>`
}

const EMPTY_TREE = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Cover Studio"><a:themeElements>
<a:clrScheme name="Cover Studio"><a:dk1><a:srgbClr val="111214"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1C1B18"/></a:dk2><a:lt2><a:srgbClr val="F1ECE3"/></a:lt2><a:accent1><a:srgbClr val="B5532C"/></a:accent1><a:accent2><a:srgbClr val="2F55FF"/></a:accent2><a:accent3><a:srgbClr val="2F4A3A"/></a:accent3><a:accent4><a:srgbClr val="123A73"/></a:accent4><a:accent5><a:srgbClr val="D4FF3A"/></a:accent5><a:accent6><a:srgbClr val="7B756A"/></a:accent6><a:hlink><a:srgbClr val="2F55FF"/></a:hlink><a:folHlink><a:srgbClr val="7B756A"/></a:folHlink></a:clrScheme>
<a:fontScheme name="Cover Studio"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>
<a:fmtScheme name="Cover Studio"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>
<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>
<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>
<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`

/**
 * Scale each block so its widest line, set in the PowerPoint face, is no wider
 * than it was in the design face. Georgia runs ~30 % wider than Instrument
 * Serif; unscaled, a title that fits its column on the canvas spills across
 * the photo in PowerPoint. `measure` returns the width of `text` at `sizePx`
 * in `face` (a canvas measureText in the browser).
 */
export function fitBlocksToFaces(blocks: TextBlock[], measure: (text: string, face: string, sizePx: number, weight: number, italic: boolean) => number): TextBlock[] {
  return blocks.map((b) => {
    const face = PPTX_FONTS[b.family]
    const widest = Math.max(...b.lines.map((l) => measure(l, face, b.size, b.weight, b.italic) + Math.max(0, l.length - 1) * b.tracking))
    if (!(widest > 0) || widest <= b.width * 1.02) return b
    const k = b.width / widest
    return { ...b, size: b.size * k, tracking: b.tracking * k }
  })
}

/** One editable text box per block, positioned to match the canvas render. */
export function textShapesXml(blocks: TextBlock[], width: number, cx: number, firstId = 3, lang = 'en-US'): string {
  const k = cx / Math.max(1, width) // EMU per canvas px
  const emu = (v: number) => Math.round(v * k)
  return blocks.map((b, i) => {
    const lh = b.lineHeight
    // PowerPoint puts an exact-spaced line's baseline ~80 % down the line box.
    const top = b.y - lh * 0.8
    const w = b.width * 1.08 + b.size * 0.4
    const h = lh * b.lines.length
    const left = b.align === 'center' ? b.x - w / 2 : b.align === 'right' ? b.x - w : b.x
    const pt = (px: number) => (px * k) / 12700
    const sz = Math.max(100, Math.round(pt(b.size) * 100))
    const spc = Math.round(pt(b.tracking) * 100)
    const alpha = b.alpha < 0.999 ? `<a:alpha val="${Math.round(b.alpha * 100000)}"/>` : ''
    const algn = b.align === 'center' ? 'ctr' : b.align === 'right' ? 'r' : 'l'
    const rPr = `<a:rPr lang="${lang}" sz="${sz}"${b.weight >= 600 ? ' b="1"' : ''}${b.italic ? ' i="1"' : ''}${spc ? ` spc="${spc}"` : ''} dirty="0">`
      + `<a:solidFill><a:srgbClr val="${b.color.replace('#', '')}">${alpha}</a:srgbClr></a:solidFill>`
      + `<a:latin typeface="${PPTX_FONTS[b.family]}"/><a:cs typeface="${PPTX_FONTS[b.family]}"/></a:rPr>`
    const paras = b.lines.map((l) => `<a:p><a:pPr algn="${algn}"><a:lnSpc><a:spcPts val="${Math.round(pt(lh) * 100)}"/></a:lnSpc></a:pPr><a:r>${rPr}<a:t>${esc(l)}</a:t></a:r></a:p>`).join('')
    const id = firstId + i
    return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
      + `<p:spPr><a:xfrm><a:off x="${emu(left)}" y="${emu(top)}"/><a:ext cx="${emu(w)}" cy="${emu(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>`
      + `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`
  }).join('')
}

export function buildImagePptx(slides: PptxSlide[], width: number, height: number, title = 'Presentation', lang = 'en-US'): Uint8Array {
  const { cx, cy } = slideSizeEmu(width, height)
  const enc = new TextEncoder()
  const files: Record<string, Uint8Array> = {}
  const put = (path: string, s: string) => { files[path] = enc.encode(s) }

  put('[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Default Extension="png" ContentType="image/png"/>'
    + '<Default Extension="jpeg" ContentType="image/jpeg"/>'
    + `<Override PartName="/ppt/presentation.xml" ContentType="${CT}.presentationml.presentation.main+xml"/>`
    + `<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="${CT}.presentationml.slideMaster+xml"/>`
    + `<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="${CT}.presentationml.slideLayout+xml"/>`
    + `<Override PartName="/ppt/theme/theme1.xml" ContentType="${CT}.theme+xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
    + slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="${CT}.presentationml.slide+xml"/>`).join('')
    + '</Types>')

  put('_rels/.rels', rels([
    { id: 'rId1', type: 'officeDocument', target: 'ppt/presentation.xml' },
    { id: 'rId2', type: 'metadata/core-properties', target: 'docProps/core.xml' },
  ]).replace(`${REL}/metadata/core-properties`, 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties'))

  put('docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${esc(title)}</dc:title><dc:creator>ifcvieweronline.eu</dc:creator></cp:coreProperties>`)

  put('ppt/presentation.xml', `${XML}<p:presentation ${NS} saveSubsetFonts="1">`
    + '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
    + `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 3}"/>`).join('')}</p:sldIdLst>`
    + `<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="6858000" cy="9144000"/>`
    + '</p:presentation>')
  put('ppt/_rels/presentation.xml.rels', rels([
    { id: 'rId1', type: 'slideMaster', target: 'slideMasters/slideMaster1.xml' },
    { id: 'rId2', type: 'theme', target: 'theme/theme1.xml' },
    ...slides.map((_, i) => ({ id: `rId${i + 3}`, type: 'slide', target: `slides/slide${i + 1}.xml` })),
  ]))

  put('ppt/slideMasters/slideMaster1.xml', `${XML}<p:sldMaster ${NS}><p:cSld><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld>`
    + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
    + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>')
  put('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([
    { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
    { id: 'rId2', type: 'theme', target: '../theme/theme1.xml' },
  ]))
  put('ppt/slideLayouts/slideLayout1.xml', `${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>${EMPTY_TREE}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`)
  put('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([{ id: 'rId1', type: 'slideMaster', target: '../slideMasters/slideMaster1.xml' }]))
  put('ppt/theme/theme1.xml', THEME)

  slides.forEach((s, i) => {
    const n = i + 1
    const media = `image${n}.${s.ext}`
    files[`ppt/media/${media}`] = s.image
    put(`ppt/slides/slide${n}.xml`, `${XML}<p:sld ${NS}><p:cSld><p:spTree>${EMPTY_TREE}`
      + `<p:pic><p:nvPicPr><p:cNvPr id="2" name="Slide ${n}" descr="${esc(s.alt ?? '')}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>`
      + '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
      + `<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
      + textShapesXml(s.texts ?? [], width, cx, 3, lang)
      + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')
    put(`ppt/slides/_rels/slide${n}.xml.rels`, rels([
      { id: 'rId1', type: 'slideLayout', target: '../slideLayouts/slideLayout1.xml' },
      { id: 'rId2', type: 'image', target: `../media/${media}` },
    ]))
  })

  // Images are already compressed; deflating them again only costs time.
  const opts: Record<string, [Uint8Array, { level: 0 | 6 }]> = {}
  for (const [k, v] of Object.entries(files)) opts[k] = [v, { level: k.startsWith('ppt/media/') ? 0 : 6 }]
  return zipSync(opts)
}
