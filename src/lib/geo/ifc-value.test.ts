// ─── ifc-value tests ──────────────────────────────────────────────────────────
// Regression cover for the attribute shapes web-ifc actually returns. The
// numArray wrapper case is the one that shipped broken: it silently reported
// georeferenced IFC2x3 files as having no location at all.

import { describe, it, expect } from 'vitest'
import { num, str, ref, numArray } from './ifc-value'

describe('num', () => {
  it('accepts bare numbers and wrappers', () => {
    expect(num(12)).toBe(12)
    expect(num({ type: 4, value: 12 })).toBe(12)
    expect(num({ value: '12.5' })).toBe(12.5)
  })

  it('rejects non-finite and non-numeric values', () => {
    expect(num(NaN)).toBeNull()
    expect(num(Infinity)).toBeNull()
    expect(num({ value: NaN })).toBeNull()
    expect(num({ value: 'abc' })).toBeNull()
    expect(num(null)).toBeNull()
    expect(num(undefined)).toBeNull()
    expect(num({})).toBeNull()
  })

  it('keeps zero, which is a legitimate value', () => {
    expect(num(0)).toBe(0)
    expect(num({ value: 0 })).toBe(0)
  })
})

describe('str', () => {
  it('accepts bare strings and wrappers', () => {
    expect(str('EPSG:25832')).toBe('EPSG:25832')
    expect(str({ type: 1, value: 'EPSG:25832' })).toBe('EPSG:25832')
  })

  it('rejects numbers and empties', () => {
    expect(str(5)).toBeNull()
    expect(str({ value: 5 })).toBeNull()
    expect(str(null)).toBeNull()
  })
})

describe('ref', () => {
  it('reads the express id out of an entity reference', () => {
    expect(ref({ type: 5, value: 38274 })).toBe(38274)
  })

  it('rejects anything that is not a numeric reference', () => {
    expect(ref({ type: 1, value: 'x' })).toBeNull()
    expect(ref(38274)).toBeNull()
    expect(ref(null)).toBeNull()
  })
})

describe('numArray', () => {
  it('accepts a bare array', () => {
    expect(numArray([41, 52, 27, 840000])).toEqual([41, 52, 27, 840000])
  })

  it('UNWRAPS an IfcCompoundPlaneAngleMeasure — the shape web-ifc really returns', () => {
    // This is the regression: rung 3 of the georeferencing ladder was dead
    // because every RefLatitude arrives wrapped like this.
    expect(numArray({ type: 10, value: [41, 52, 27, 840000] })).toEqual([41, 52, 27, 840000])
  })

  it('unwraps elements that are themselves wrapped', () => {
    expect(numArray([{ value: 41 }, { value: 52 }, { value: 27 }])).toEqual([41, 52, 27])
  })

  it('keeps negative components (southern / western coordinates)', () => {
    expect(numArray({ type: 10, value: [-87, -38, -21, -839999] }))
      .toEqual([-87, -38, -21, -839999])
  })

  it('returns null for empty, missing or non-list values', () => {
    expect(numArray([])).toBeNull()
    expect(numArray({ type: 10, value: [] })).toBeNull()
    expect(numArray(null)).toBeNull()
    expect(numArray(undefined)).toBeNull()
    expect(numArray(41)).toBeNull()
    expect(numArray({ value: 41 })).toBeNull()
    expect(numArray({})).toBeNull()
  })

  it('rejects the whole list when any element is unreadable', () => {
    // Half-parsed coordinates are worse than none — they place a model wrongly.
    expect(numArray([41, 'x', 27])).toBeNull()
    expect(numArray({ type: 10, value: [41, null, 27] })).toBeNull()
  })
})
