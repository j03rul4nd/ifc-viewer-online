// @vitest-environment node
// Revision report (PDF/XLSX), per-change capture and per-change BCF 3.0 on the
// F8 golden fixture (three ISO 19650-named files per side).
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { IfcAPI } from 'web-ifc'
import { unzipSync, strFromU8 } from 'fflate'
import i18next from 'i18next'
import en from '../../locales/en/compare.json'
import th from '../../locales/th/compare.json'
import { buildSnapshot } from './snapshot'
import { diffRevisions } from './revision-diff'
import type { RevisionDiff } from './revision-types'
import type { ModelSnapshot } from './types'
import {
  REVISION_REPORT_PLAN, buildRevisionReportModel, paginateRevisionReport, parseIso19650Name,
  revisionReportText, revisionToPdf, revisionToXlsx, orderedChanges, type ReportCanvas, type RevisionReportText,
} from './report-revision'
import { createChangeCapturer, resolverFromDiff, captureImages, type ChangeCaptureViewer } from './capture-change'
import { CHANGE_KIND_BCF_COLOR, buildRevisionChangeTopics, revisionChangesToBcfZip } from './bcf-sync'

const F8 = join(process.cwd(), 'tests', 'fixtures', 'revision', 'F8')
// 1×1 PNG
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

let diff: RevisionDiff
let text: RevisionReportText
let textTh: RevisionReportText

beforeAll(async () => {
  const api = new IfcAPI(); await api.Init()
  const side = async (w: 'a' | 'b'): Promise<ModelSnapshot[]> => {
    const out: ModelSnapshot[] = []
    for (const f of readdirSync(join(F8, w)).sort()) {
      const bytes = readFileSync(join(F8, w, f))
      const id = api.OpenModel(bytes)
      try { out.push(await buildSnapshot(api, id, { id: `${w}/${f}`, fileName: f, sourceBytes: bytes.length, geometry: true })) } finally { api.CloseModel(id) }
    }
    return out
  }
  diff = diffRevisions(await side('a'), await side('b'), undefined, { labels: { base: 'Rev P01', head: 'Rev P02' } })
  const i18n = i18next.createInstance()
  await i18n.init({ lng: 'en', resources: { en: { compare: en }, th: { compare: th } }, defaultNS: 'compare', interpolation: { escapeValue: false } })
  text = revisionReportText(i18n.getFixedT('en', 'compare'), 'en')
  textTh = revisionReportText(i18n.getFixedT('th', 'compare'), 'th')
}, 180_000)

const expected = (): Array<{ kind: string; globalIdA?: string; globalIdB?: string }> =>
  JSON.parse(readFileSync(join(F8, 'expected.json'), 'utf8')).changes

/** Canvas double: records text and images, returns a tiny "JPEG". */
function recorder() {
  const texts: string[] = []
  const images: unknown[] = []
  let pages = 0
  const make = (): ReportCanvas => {
    pages++
    const ctx = new Proxy({} as Record<string, unknown>, {
      get(target, prop) {
        if (prop === 'measureText') return (s: string) => ({ width: s.length * 11 })
        if (prop === 'fillText') return (s: string) => { texts.push(s) }
        if (prop === 'drawImage') return (img: unknown) => { images.push(img) }
        if (prop in target) return target[prop as string]
        return () => {}
      },
      set(target, prop, v) { target[prop as string] = v; return true },
    }) as unknown as CanvasRenderingContext2D
    return { ctx, toJpeg: async () => new Uint8Array([0xff, 0xd8, 0xff, 0xd9]) }
  }
  return { make, texts, images, pages: () => pages }
}

describe('ISO 19650 names', () => {
  it('parses the seven fields, status and revision', () => {
    expect(parseIso19650Name('BCN-IVO-ZZ-XX-M3-A-0001.ifc')).toEqual({ project: 'BCN', originator: 'IVO', volume: 'ZZ', level: 'XX', type: 'M3', role: 'A', number: '0001' })
    expect(parseIso19650Name('C:/x/BCN-IVO-ZZ-XX-M3-A-0001-S2-P03.ifc')).toMatchObject({ status: 'S2', revision: 'P03' })
    expect(parseIso19650Name('PRJ-ORG-Z1-01-M3-S-000123_C01.1.ifc')).toMatchObject({ revision: 'C01.1' })
    expect(parseIso19650Name('model_v2.ifc')).toBeNull()
    expect(parseIso19650Name('A-B-C-D-E-F-G.ifc')).toBeNull()
  })
})

describe('plan flag', () => {
  it('marks PDF and XLSX as Pro without charging', () => {
    expect(REVISION_REPORT_PLAN.pdf.requiresPlan).toBe('pro')
    expect(REVISION_REPORT_PLAN.xlsx.requiresPlan).toBe('pro')
  })
})

describe('report model on F8', () => {
  it('has one card per expected change, sentence included', () => {
    const model = buildRevisionReportModel(diff, text)
    expect(model.cards.length).toBe(expected().length)
    expect(model.total).toBe(expected().length)
    expect(model.filesA.map((f) => f.name)).toEqual(expect.arrayContaining(['BCN-IVO-ZZ-XX-M3-A-0001.ifc']))
    expect(model.filesA.every((f) => f.iso?.project === 'BCN')).toBe(true)
    for (const c of model.cards) {
      expect(c.sentence).not.toMatch(/report\.revision|\{\{/)
      expect(c.sentence.length).toBeGreaterThan(2)
    }
    const pages = paginateRevisionReport(model)
    const inPages = pages.flatMap((p) => (p.type === 'cards' ? p.cards.map((c) => c.globalId) : []))
    expect(inPages).toEqual(model.cards.map((c) => c.globalId))
  })
})

describe('PDF on F8', () => {
  it('lists every expected change, each with its capture', async () => {
    const changes = orderedChanges(diff)
    const caps = Object.fromEntries(changes.map((c) => [c.globalId, PNG]))
    const rec = recorder()
    const loaded: string[] = []
    const pdf = await revisionToPdf(diff, caps, text, {
      createCanvas: rec.make,
      loadImage: async (src) => { loaded.push(src); return { width: 800, height: 500 } as unknown as ImageBitmap },
    })
    expect(strFromU8(pdf.slice(0, 8))).toBe('%PDF-1.4')
    const model = buildRevisionReportModel(diff, text)
    expect(rec.pages()).toBe(paginateRevisionReport(model).length)
    expect(rec.images.length).toBe(expected().length)
    expect(loaded.length).toBe(expected().length)
    for (const c of model.cards) {
      expect(rec.texts.some((s) => s.includes(c.sentence) || c.sentence.startsWith(s))).toBe(true)
      expect(rec.texts).toContain(c.globalId)
    }
    expect(strFromU8(pdf).match(/\/Type \/Page /g)?.length).toBe(rec.pages())
  })

  it('draws a placeholder when a change has no capture, and renders Thai', async () => {
    const rec = recorder()
    await revisionToPdf(diff, {}, textTh, { createCanvas: rec.make, loadImage: async () => null })
    expect(rec.images.length).toBe(0)
    expect(rec.texts.filter((s) => s === textTh.noCapture).length).toBe(expected().length)
    expect(rec.texts).toContain(textTh.title)
  })
})

describe('XLSX on F8', () => {
  it('opens with exceljs and has every change on the changes sheet', async () => {
    const bytes = await revisionToXlsx(diff, text)
    if (process.env.REVISION_REPORT_OUT) writeFileSync(join(process.env.REVISION_REPORT_OUT, 'F8.xlsx'), bytes)
    const { Workbook } = await import('exceljs')
    const wb = new Workbook()
    await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    expect(wb.worksheets.map((w) => w.name)).toEqual([text.sheetSummary, text.sheetChanges])
    const ws = wb.getWorksheet(text.sheetChanges)!
    const header = (ws.getRow(1).values as unknown[]).slice(1)
    expect(header).toEqual(expect.arrayContaining([text.a, text.b, 'GlobalId']))
    const gids = new Set<string>()
    ws.eachRow((r, n) => { if (n > 1) gids.add(String(r.getCell(2).value)) })
    for (const c of orderedChanges(diff)) expect(gids.has(c.globalId)).toBe(true)
  }, 60_000)
})

describe('captureChange', () => {
  it('isolates, frames, selects, snapshots and restores the camera', async () => {
    const calls: string[] = []
    const cam = { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, fovDeg: 45, aspect: 1.5 }
    const viewer: ChangeCaptureViewer = {
      isolateElements: (t, on) => { calls.push(`isolate:${on}:${t.length}`) },
      frameElement: async (id) => { calls.push(`frame:${id}`); return true },
      selectElement: (id) => { calls.push(`select:${id}`) },
      clearSelection: () => { calls.push('clear') },
      getCameraViewpoint: () => cam,
      setCameraLookAt: () => { calls.push('restore') },
      takeSnapshot: () => { calls.push('shot'); return PNG },
    }
    const changes = orderedChanges(diff)
    const resolve = resolverFromDiff(diff, (_f, side) => side)
    const cap = createChangeCapturer(viewer, resolve, { wait: async () => {} })
    const all = await cap.captureAll(changes.map((c) => c.globalId))
    expect(Object.keys(all).length).toBe(changes.length)
    expect(calls.slice(-3)).toEqual(['clear', 'isolate:false:0', 'restore'])
    expect(captureImages(all)[changes[0].globalId]).toBe(PNG)
    expect(await cap.captureChange('not-a-guid')).toBeNull()
  })
})

describe('BCF 3.0 on F8', () => {
  it('one topic per change, titled with the site sentence, coloured by GUID, with snapshot', () => {
    const changes = orderedChanges(diff)
    const cam = { position: { x: 5, y: 5, z: 5 }, target: { x: 0, y: 0, z: 0 }, direction: { x: -0.57735, y: -0.57735, z: -0.57735 }, up: { x: 0, y: 1, z: 0 }, fovDeg: 50, aspect: 1.6 }
    const caps = Object.fromEntries(changes.map((c) => [c.globalId, { snapshot: PNG, camera: cam }]))
    const btext = { author: 'site@example.test', sentence: text.sentence }
    const { bytes, topics } = revisionChangesToBcfZip(diff, btext, caps, new Date('2026-11-13T10:00:00Z'))
    if (process.env.REVISION_REPORT_OUT) writeFileSync(join(process.env.REVISION_REPORT_OUT, 'F8.bcfzip'), bytes)
    expect(topics.length).toBe(expected().length)
    const files = unzipSync(bytes)
    expect(strFromU8(files['bcf.version'])).toContain('VersionId="3.0"')
    for (const [i, t] of topics.entries()) {
      const c = changes.find((x) => text.sentence(x) === t.title)
      expect(c, `topic ${i}`).toBeTruthy()
      const markup = strFromU8(files[`${t.guid}/markup.bcf`])
      expect(markup).toContain('<Snapshot>snapshot_0.png</Snapshot>')
      const vp = strFromU8(files[`${t.guid}/viewpoint_0.bcfv`])
      expect(vp).toMatch(/<Selection>[\s\S]*<\/Selection>\s*<Coloring>/)
      expect(vp).toContain(`Color="${CHANGE_KIND_BCF_COLOR[c!.kind]}"`)
      const gid = c!.kind === 'removed' ? c!.match.baseGlobalIds[0] : c!.match.headGlobalIds[0]
      expect(vp).toContain(`IfcGuid="${gid}"`)
      expect(vp).toContain('<PerspectiveCamera>')
      expect(files[`${t.guid}/snapshot_0.png`][1]).toBe(0x50) // 'P' of \x89PNG
    }
  })

  it('keeps a valid camera when a change has no capture', () => {
    const topics = buildRevisionChangeTopics(diff, { author: 'a', sentence: text.sentence })
    for (const t of topics) expect(t.viewpoints[0].cameraPosition).toBeTruthy()
  })
})

// Writes F8 outputs for manual checks (XSD, LibreOffice) when asked.
if (process.env.REVISION_REPORT_OUT) mkdirSync(process.env.REVISION_REPORT_OUT, { recursive: true })
