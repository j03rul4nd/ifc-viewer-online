import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { asBuiltFlag, asBuiltVisible } from './AsBuiltSection'
import AsBuiltSection from './AsBuiltSection'
import { AsBuiltResults, runBlock, sortWorstFirst, MAX_ROWS } from './AsBuiltPanel'
import type { AsBuiltPipelineResult } from '../../lib/asbuilt/pipeline'
import type { ElementDeviation } from '../../lib/asbuilt/as-built-score'
import en from '../../locales/en/pointcloud.json'
import es from '../../locales/es/pointcloud.json'
import fs from 'node:fs'
import path from 'node:path'

const ready = [{ id: 'c1', name: 'scan.las', status: 'ready' }]
const ref = { current: null }

describe('As-Built section visibility', () => {
  it('reads the ?asbuilt flag', () => {
    expect(asBuiltFlag('?asbuilt=1')).toBe(true)
    expect(asBuiltFlag('?asbuilt')).toBe(true)
    expect(asBuiltFlag('')).toBe(false)
    expect(asBuiltFlag('?asbuilt=0')).toBe(false)
  })

  it('needs the flag, an IFC and a ready scan', () => {
    expect(asBuiltVisible({ flag: true, modelCount: 1, clouds: ready })).toBe(true)
    expect(asBuiltVisible({ flag: false, modelCount: 1, clouds: ready })).toBe(false)
    expect(asBuiltVisible({ flag: true, modelCount: 0, clouds: ready })).toBe(false)
    expect(asBuiltVisible({ flag: true, modelCount: 1, clouds: [{ id: 'c', name: 'x', status: 'loading' }] })).toBe(false)
  })

  it('renders nothing when hidden, and the Preview section when shown', () => {
    const hidden = renderToStaticMarkup(<AsBuiltSection viewerApiRef={ref} modelIds={['m']} activeModelId="m" clouds={ready} flag={false} />)
    expect(hidden).toBe('')
    const noModel = renderToStaticMarkup(<AsBuiltSection viewerApiRef={ref} modelIds={[]} activeModelId={null} clouds={ready} flag />)
    expect(noModel).toBe('')
    const noCloud = renderToStaticMarkup(<AsBuiltSection viewerApiRef={ref} modelIds={['m']} activeModelId="m" clouds={[]} flag />)
    expect(noCloud).toBe('')
    const shown = renderToStaticMarkup(<AsBuiltSection viewerApiRef={ref} modelIds={['m']} activeModelId="m" clouds={ready} flag />)
    expect(shown).toContain('data-testid="asbuilt-section"')
    expect(shown).toContain('asBuilt.preview')
  })
})

describe('run gate', () => {
  it('blocks with a reason before a fit exists', () => {
    expect(runBlock({ completePairs: 2, fitError: null, gate: null, alignmentRmseM: null, declaredMm: 25 }))
      .toEqual({ kind: 'need-pairs', have: 2, need: 4 })
  })
  it('blocks a degenerate fit', () => {
    expect(runBlock({ completePairs: 4, fitError: { error: 'degenerate', detail: '' }, gate: null, alignmentRmseM: null, declaredMm: 25 })?.kind).toBe('degenerate')
  })
  it('blocks 3 pairs (scoring needs 4) and a coarse alignment', () => {
    expect(runBlock({ completePairs: 3, fitError: null, gate: { ok: false, reason: 'too-few-pairs-to-score' }, alignmentRmseM: 0.002, declaredMm: 25 })?.kind).toBe('too-few-pairs-to-score')
    expect(runBlock({ completePairs: 4, fitError: null, gate: { ok: false, reason: 'alignment-too-coarse' }, alignmentRmseM: 0.02, declaredMm: 25 }))
      .toEqual({ kind: 'alignment-too-coarse', rmseMm: 20, tolMm: 25 })
  })
  it('lets a passing gate run', () => {
    expect(runBlock({ completePairs: 4, fitError: null, gate: { ok: true }, alignmentRmseM: 0.003, declaredMm: 25 })).toBeNull()
  })
})

const el = (id: number, state: ElementDeviation['state'], p95: number | null): ElementDeviation =>
  ({ id, ifcClass: 'IFCWALL', state, deviationP95: p95, matchedFraction: 0.5 })

function result(over: Partial<AsBuiltPipelineResult> = {}): AsBuiltPipelineResult {
  return {
    score: 82, inconclusiveReason: null,
    coverage: { total: 4, observed: 3, occluded: 0, unobserved: 1, observedFraction: 0.75 },
    contributions: [], counts: { conforming: 1, deviated: 1, missing: 1, unmodelled: 0 },
    elements: [el(1, 'conforming', 0.004), el(2, 'unobserved', null), el(3, 'deviated', 0.06), el(4, 'missing', null), el(5, 'deviated', 0.09)],
    unmodelled: [],
    ...over,
  }
}

describe('results', () => {
  it('sorts worst first', () => {
    expect(sortWorstFirst(result().elements).map((e) => e.id)).toEqual([4, 5, 3, 1, 2])
  })

  it('shows score, coverage and one row per element', () => {
    const html = renderToStaticMarkup(<AsBuiltResults result={result()} labels={new Map([[5, { name: 'Wall A', globalId: '2O2Fr$t4X7Zf8NOew3FLOH' }]])} />)
    expect(html).toContain('>82<')
    expect(html).toContain('75 %')
    expect(html.match(/data-testid="asbuilt-row"/g)).toHaveLength(5)
    expect(html).toContain('Wall A')
    expect(html).toContain('2O2Fr$t4X7Zf8NOew3FLOH')
    expect(html).toContain('>90<') // p95 in mm
    expect(html).not.toContain('asbuilt-refusal')
  })

  it('renders a refusal as text, never as a score', () => {
    const html = renderToStaticMarkup(<AsBuiltResults result={result({ score: null, inconclusiveReason: 'low-coverage' })} labels={new Map()} />)
    expect(html).toContain('data-testid="asbuilt-refusal"')
    expect(html).toContain('asBuilt.result.inconclusive.low-coverage')
    expect(html).not.toContain('asBuilt.result.score')
  })

  it('caps the table', () => {
    const many = Array.from({ length: MAX_ROWS + 5 }, (_, i) => el(i, 'deviated', 0.01))
    const html = renderToStaticMarkup(<AsBuiltResults result={result({ elements: many })} labels={new Map()} />)
    expect(html.match(/data-testid="asbuilt-row"/g)).toHaveLength(MAX_ROWS)
  })
})

describe('i18n', () => {
  const keys = (o: unknown, p = ''): string[] => typeof o === 'object' && o !== null
    ? Object.entries(o).flatMap(([k, v]) => keys(v, p ? `${p}.${k}` : k)) : [p]
  it('every locale has the same asBuilt keys as English', () => {
    const want = keys(en.asBuilt).sort()
    expect(keys(es.asBuilt).sort()).toEqual(want)
    const dir = path.resolve(__dirname, '../../locales')
    for (const lng of fs.readdirSync(dir)) {
      const f = path.join(dir, lng, 'pointcloud.json')
      if (!fs.existsSync(f)) continue
      expect(keys(JSON.parse(fs.readFileSync(f, 'utf8')).asBuilt).sort(), lng).toEqual(want)
    }
  })
  it('never mentions AI', () => {
    expect(JSON.stringify(en.asBuilt)).not.toMatch(/\bAI\b|artificial/i)
  })
})
