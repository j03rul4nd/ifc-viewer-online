// ─── Cover Studio exporters ────────────────────────────────────────────────────
// Every export paints with renderSlide — the function the preview uses — at
// the format's full pixel size, so what the user approved is what they get.

import { zipSync } from 'fflate'
import { renderSlide, type CoverTemplateId } from '../../lib/cover/templates'
import { buildImagePdf } from '../../lib/cover/pdf'
import { buildImagePptx, fitBlocksToFaces } from '../../lib/cover/pptx'
import { groupRuns, recordText } from '../../lib/cover/text-layer'
import type { CoverSpec } from '../../lib/cover/types'

export function canvasToBlob(c: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', q = 0.92): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q))
}

export function slug(s: string): string {
  return (s || 'project').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'project'
}

export async function renderToBlob(spec: CoverSpec, template: CoverTemplateId, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = spec.width
  c.height = spec.height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('no 2d context')
  renderSlide(ctx, template, spec)
  return canvasToBlob(c, type)
}

export function slideName(base: string, spec: CoverSpec, many: boolean, ext: string): string {
  return `${base}${many ? `-${String(spec.index).padStart(2, '0')}` : ''}.${ext}`
}

export async function buildZip(specs: CoverSpec[], template: CoverTemplateId, base: string): Promise<Blob> {
  const files: Record<string, Uint8Array> = {}
  for (const s of specs) files[slideName(base, s, true, 'png')] = new Uint8Array(await (await renderToBlob(s, template, 'image/png')).arrayBuffer())
  return new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' })
}

export async function buildPdf(specs: CoverSpec[], template: CoverTemplateId, title: string): Promise<Blob> {
  const pages = []
  for (const s of specs) pages.push({ jpeg: new Uint8Array(await (await renderToBlob(s, template, 'image/jpeg')).arrayBuffer()), width: s.width, height: s.height })
  return new Blob([buildImagePdf(pages, title)], { type: 'application/pdf' })
}

export async function buildPptx(specs: CoverSpec[], template: CoverTemplateId, title: string, lang: string): Promise<Blob> {
  const slides = []
  for (const s of specs) {
    // Paint with fillText recorded: the picture is the text-free background and
    // the text comes back as native, editable PowerPoint text boxes.
    const c = document.createElement('canvas')
    c.width = s.width
    c.height = s.height
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    const runs = recordText(ctx, () => renderSlide(ctx, template, s))
    const png = await canvasToBlob(c, 'image/png')
    const texts = fitBlocksToFaces(groupRuns(runs), (str, face, px, weight, italic) => {
      ctx.font = `${italic ? 'italic ' : ''}${weight >= 600 ? 700 : 400} ${px}px '${face}'`
      return ctx.measureText(str).width
    })
    slides.push({ image: new Uint8Array(await png.arrayBuffer()), ext: 'png' as const, alt: s.shots[0]?.label ?? title, texts })
  }
  const first = specs[0]
  return new Blob([buildImagePptx(slides, first?.width ?? 1920, first?.height ?? 1080, title, lang)], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  })
}

/** Whether this browser can hand a PNG to the OS share sheet (mobile, Safari, Edge). */
export function canShareFiles(): boolean {
  try {
    if (typeof navigator === 'undefined' || !navigator.canShare) return false
    return navigator.canShare({ files: [new File([new Uint8Array(1)], 'x.png', { type: 'image/png' })] })
  } catch {
    return false
  }
}
