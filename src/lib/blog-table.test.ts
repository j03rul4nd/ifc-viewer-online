import { describe, expect, it } from 'vitest'
import { analyzeTable, compareCells, filterRows, parseCell } from './blog-table'

describe('parseCell', () => {
  it('strips verdict glyphs but keeps verdict words visible', () => {
    expect(parseCell('✅ 44 rules + score')).toEqual({ tone: 'yes', text: '44 rules + score' })
    expect(parseCell('✗')).toEqual({ tone: 'no', text: '' })
    expect(parseCell('⚠️ Plugin')).toEqual({ tone: 'partial', text: 'Plugin' })
    expect(parseCell('Partial (via MVD)')).toEqual({ tone: 'partial', text: 'Partial (via MVD)' })
    expect(parseCell('Yes — authoritative').tone).toBe('yes')
    expect(parseCell('Sí').tone).toBe('yes')
  })

  it('does not read a verdict into ordinary words', () => {
    expect(parseCell('None').tone).toBeNull()      // "Install: None" is good news
    expect(parseCell('Nothing').tone).toBeNull()
    expect(parseCell('Notes').tone).toBeNull()
    expect(parseCell('Yesterday').tone).toBeNull()
  })
})

describe('analyzeTable', () => {
  it('stacks a small prose table', () => {
    const t = analyzeTable(['Stage', 'Score', 'Evidence'], [['a', '70', 'x'], ['b', '80', 'y']])
    expect(t.kind).toBe('stack')
    expect(t.sortable).toBe(false)
  })

  it('treats a grid of verdicts as a matrix', () => {
    const rows = Array.from({ length: 8 }, (_, i) => [`Tool ${i}`, '✓', '✗', 'Partial', '€10'])
    const t = analyzeTable(['Tool', 'A', 'B', 'C', 'Cost'], rows)
    expect(t.kind).toBe('matrix')
    expect(t.sortable).toBe(true)
    expect(t.searchable).toBe(true)
  })

  it('keeps wide prose tables as records', () => {
    const t = analyzeTable(['Level', 'Checks', 'Catches', 'Tools'], [['L1', 'long prose', 'long prose', 'many']])
    expect(t.kind).toBe('records')
  })
})

describe('sorting and filtering', () => {
  it('ranks verdicts and numbers sensibly', () => {
    expect(['✗', '✓', 'Partial'].sort(compareCells)).toEqual(['✗', 'Partial', '✓'])
    expect(['€99', '€5', '€30'].sort(compareCells)).toEqual(['€5', '€30', '€99'])
  })

  it('filters on any cell, case-insensitively', () => {
    expect(filterRows([['Solibri', 'Desktop'], ['Dalux', 'Browser']], 'browser')).toEqual([['Dalux', 'Browser']])
  })
})
