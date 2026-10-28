// A small CSV reader for what people export from Excel, Sheets or an ERP:
// comma, semicolon (European Excel) or tab separated, quoted fields with
// doubled quotes, CRLF or LF, an optional BOM. No dependency, no upload.

export function detectDelimiter(text: string): string {
  const first = text.split(/\r?\n/).find((l) => l.trim()) ?? ''
  const count = (d: string) => first.split(d).length - 1
  const c = { ',': count(','), ';': count(';'), '\t': count('\t') }
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] : ',')
}

export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const s = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"' && field === '') { quoted = true; continue }
    if (ch === delimiter) { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
      continue
    }
    field += ch
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  const cell = (v: string | number | undefined | null) => {
    const t = v == null ? '' : String(v)
    return /[",\n\r;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return rows.map((r) => r.map(cell).join(',')).join('\n')
}
