import { describe, expect, it } from 'vitest'
import {
  COUNTER_MARK, DEFAULT_PATTERNS, NAME_MAX, PATTERN_MAX, TOKEN_MAX,
  fillCounter, normName, parseNamePattern, renderName, renderStem, sanitizeName, shortClass,
  type ParsedPattern,
} from './name-pattern'

function parse(src: string): ParsedPattern {
  const r = parseNamePattern(src)
  if (!r.ok) throw new Error(`pattern ${src} failed: ${r.error.code}`)
  return r.value
}

const wall = (storey = '', name = '') => ({ ifcClass: 'IfcWall', storey, name })

describe('renderName', () => {
  it('{class}-{storey}-{n} → Wall-Level 1-001', () => {
    expect(renderName(parse('{class}-{storey}-{n}'), wall('Level 1'), 1)).toBe('Wall-Level 1-001')
  })

  it('drops an empty token together with its separator', () => {
    expect(renderName(parse('{class}-{storey}-{n}'), wall(), 1)).toBe('Wall-001')
    expect(renderName(parse('{class}-{storey}'), wall(), 1)).toBe('Wall')
    expect(renderName(parse('{storey}-{class}'), wall(), 1)).toBe('Wall')
  })

  it('pads the counter to {n:W}, and grows past it rather than truncating', () => {
    expect(renderName(parse('{class}-{n:1}'), wall(), 7)).toBe('Wall-7')
    expect(renderName(parse('{class}-{n:4}'), wall(), 7)).toBe('Wall-0007')
    expect(renderName(parse('{class}-{n}'), wall(), 1234)).toBe('Wall-1234')
  })

  it('{ifcclass} keeps the prefix; shortClass strips it only before a capital', () => {
    expect(renderName(parse('{ifcclass}-{n}'), wall(), 1)).toBe('IfcWall-001')
    expect(shortClass('IfcBuildingStorey')).toBe('BuildingStorey')
    expect(shortClass('Ifc#123')).toBe('Ifc#123')
  })

  it('{name} uses the trimmed current name; an empty one falls back to the class', () => {
    expect(renderName(parse('{name}-{n}'), wall('', 'Door '), 1)).toBe('Door-001')
    expect(renderName(parse('{name}'), wall(), 1)).toBe('Wall-001')
    expect(renderName(parse('{name}-{n}'), wall(), 2)).toBe('Wall-002')
  })

  it('sanitises token values: whitespace collapsed, controls removed, NFC', () => {
    expect(renderName(parse('{class}-{storey}-{n}'), wall('Planta\t1ª'), 1)).toBe('Wall-Planta 1ª-001')
    expect(renderName(parse('{class}-{storey}-{n}'), wall('L\u00071\u0085'), 1)).toBe('Wall-L1-001')
    // "é" written as e + combining acute comes out composed.
    expect(renderName(parse('{storey}-{n}'), wall('Café'), 1)).toBe('Café-001')
  })

  it('caps {storey} at 64 and the whole name at 255, keeping the counter', () => {
    const long = 'S'.repeat(300)
    const stem = renderStem(parse('{class}-{storey}-{n}'), wall(long))
    expect(stem).toBe(`Wall-${'S'.repeat(TOKEN_MAX)}-${COUNTER_MARK}`)

    const huge = parse(`${'x'.repeat(90)}-{name}-{name}-{name}-{n}`)
    const name = renderName(huge, wall('', 'N'.repeat(300)), 12345)
    expect(name.length).toBeLessThanOrEqual(NAME_MAX)
    expect(name.endsWith('-12345')).toBe(true)
  })

  it('renders a pattern with no tokens as its literal', () => {
    expect(renderName(parse('Door'), wall(), 1)).toBe('Door')
    // Without a counter a later number becomes a suffix.
    expect(fillCounter('Door', 2)).toBe('Door-2')
  })

  it('strips leading and trailing separators of the whole result', () => {
    expect(renderName(parse('-{storey}-{class}-'), wall(), 1)).toBe('Wall')
  })

  it('has the documented defaults', () => {
    expect(renderName(parse(DEFAULT_PATTERNS.RULE_EMPTY_NAME), wall('Level 1'), 1)).toBe('Wall-Level 1-001')
    expect(renderName(parse(DEFAULT_PATTERNS.RULE_DUPLICATE_NAME), wall('', 'Door D1'), 2)).toBe('Door D1-002')
  })
})

describe('parseNamePattern', () => {
  const code = (src: string) => {
    const r = parseNamePattern(src)
    return r.ok ? 'ok' : r.error.code
  }

  it('reports each error', () => {
    expect(code('')).toBe('empty')
    expect(code('   ')).toBe('empty')
    expect(code('x'.repeat(PATTERN_MAX + 1))).toBe('too_long')
    expect(code('{class')).toBe('brace')
    expect(code('class}')).toBe('brace')
    expect(code('{}')).toBe('brace')
    expect(code('{type}')).toBe('type_later')
    expect(code('{n:0}')).toBe('bad_pad')
    expect(code('{n:7}')).toBe('bad_pad')
    expect(code('{n:x}')).toBe('bad_pad')
  })

  it('names the unknown token', () => {
    const r = parseNamePattern('{foo}')
    expect(r).toEqual({ ok: false, error: { code: 'unknown_token', token: 'foo' } })
  })

  it('accepts tokens in any case and lists them sorted', () => {
    const r = parseNamePattern('{CLASS}-{Storey}-{n:2}')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.tokens).toEqual(['class', 'n', 'storey'])
    expect(r.value.hasCounter).toBe(true)
    expect(r.value.parts).toEqual([
      { kind: 'tok', token: 'class' },
      { kind: 'lit', text: '-' },
      { kind: 'tok', token: 'storey' },
      { kind: 'lit', text: '-' },
      { kind: 'tok', token: 'n', pad: 2 },
    ])
  })

  it('accepts a pattern exactly at the length limit', () => {
    expect(code('x'.repeat(PATTERN_MAX))).toBe('ok')
  })
})

describe('sanitizeName / normName', () => {
  it('cleans and compares', () => {
    expect(sanitizeName('  a\t\nb  ')).toBe('a b')
    expect(normName('  Wall-Level 1-001 ')).toBe('wall-level 1-001')
  })
})
