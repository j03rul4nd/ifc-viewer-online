import { parseCsv, toCsv, parseMapping, mappingFromFilenames, buildImport, type MappingEntry } from './csv'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const exportInput = $<HTMLInputElement>('export')
const mappingInput = $<HTMLInputElement>('mapping')
const folderInput = $<HTMLInputElement>('folder')
const baseInput = $<HTMLInputElement>('base')
const fuzzyInput = $<HTMLInputElement>('fuzzy')
const runBtn = $<HTMLButtonElement>('run')
const report = $<HTMLDivElement>('report')

const hasMapping = () => !!mappingInput.files?.length || !!folderInput.files?.length
const refresh = () => { runBtn.disabled = !exportInput.files?.length || !hasMapping() }
for (const el of [exportInput, mappingInput, folderInput]) el.addEventListener('change', refresh)
folderInput.addEventListener('change', () => { fuzzyInput.checked = true })

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

runBtn.addEventListener('click', async () => {
  report.textContent = ''
  report.className = ''
  try {
    const t0 = performance.now()
    const exp = parseCsv(await exportInput.files![0].text())
    let mapping: MappingEntry[] = []
    if (mappingInput.files?.length) mapping = parseMapping(await mappingInput.files[0].text())
    if (folderInput.files?.length) {
      const base = baseInput.value.trim()
      if (!/^https:\/\//i.test(base)) throw new Error('Enter the https:// address where the folder files are hosted.')
      const names = Array.from(folderInput.files, (f) => f.webkitRelativePath || f.name)
      mapping = mapping.concat(mappingFromFilenames(names, base))
    }
    const r = buildImport(exp, mapping, { fuzzy: fuzzyInput.checked })
    const ms = Math.round(performance.now() - t0)
    const lines = [
      `Matched ${r.matched.length} product(s) in ${ms} ms.`,
      ...r.matched.filter((m) => m.by === 'fuzzy').map((m) => `  loose match: ${m.key} → ${m.handle}`),
      '',
      `Models with no product (${r.unmatchedEntries.length}):`,
      ...r.unmatchedEntries.map((e) => `  ${e.key}`),
      `Matching more than one product, skipped (${r.ambiguous.length}):`,
      ...r.ambiguous.map((a) => `  ${a.key} → ${a.handles.join(', ')}`),
      `Products still without a model (${r.unmatchedProducts.length}):`,
      ...r.unmatchedProducts.map((h) => `  ${h}`),
    ]
    report.textContent = lines.join('\n')
    if (r.matched.length) download('products-with-ifc.csv', toCsv(r.table))
  } catch (err) {
    report.className = 'err'
    report.textContent = err instanceof Error ? err.message : String(err)
  }
})
