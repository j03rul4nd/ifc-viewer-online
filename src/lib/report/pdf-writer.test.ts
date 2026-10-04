import { describe, it, expect } from 'vitest'
import { buildImagePdf, pdfString } from './pdf-writer'

// A tiny fake "JPEG": the writer never decodes it, it only has to carry the bytes.
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0x0a, 0x0d, 0xff, 0xd9])

function text(b: Uint8Array): string {
  return Array.from(b, (c) => String.fromCharCode(c)).join('')
}

describe('pdf writer', () => {
  it('writes a valid skeleton with one image per page', () => {
    const pdf = buildImagePdf([{ jpeg, width: 100, height: 141 }, { jpeg, width: 100, height: 141 }], { title: 'Informe solar', date: new Date(Date.UTC(2026, 9, 4)) })
    const s = text(pdf)
    expect(s.startsWith('%PDF-1.4')).toBe(true)
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(s).toContain('/Count 2')
    expect((s.match(/\/Subtype \/Image/g) ?? []).length).toBe(2)
    expect(s).toContain('/Filter /DCTDecode')
    expect(s).toContain('/CreationDate (D:20261004000000Z)')
  })

  it('xref offsets point at their objects and startxref at the table', () => {
    const pdf = buildImagePdf([{ jpeg, width: 10, height: 10 }])
    const s = text(pdf)
    const startxref = Number(/startxref\n(\d+)/.exec(s)![1])
    expect(s.slice(startxref, startxref + 4)).toBe('xref')
    const rows = s.slice(startxref).split('\n').slice(2).filter((l) => / 00000 n $/.test(l))
    rows.forEach((row, k) => {
      const off = Number(row.slice(0, 10))
      expect(s.slice(off, off + `${k + 1} 0 obj`.length)).toBe(`${k + 1} 0 obj`)
    })
  })

  it('carries the JPEG bytes untouched, with the right length', () => {
    const pdf = buildImagePdf([{ jpeg, width: 10, height: 10 }])
    const s = text(pdf)
    expect(s).toContain(`/Length ${jpeg.length}`)
    expect(s).toContain(text(jpeg))
  })

  it('escapes strings, and turns non-Latin text into UTF-16', () => {
    expect(pdfString('a (b) \\c')).toBe('(a \\(b\\) \\\\c)')
    expect(pdfString('Año')).toBe('<FEFF0041006E006F>'.replace('006E', '00F1'))
    expect(pdfString('日')).toBe('<FEFF65E5>')
  })
})
