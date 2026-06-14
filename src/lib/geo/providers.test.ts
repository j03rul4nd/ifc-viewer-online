// ─── providers tests ──────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach } from 'vitest'
import {
  BUILTIN_PROVIDERS,
  DEFAULT_PROVIDER_ID,
  validateCustomTemplate,
  saveCustomProvider,
  loadCustomProvider,
  clearCustomProvider,
  resolveProvider,
  buildTileUrl,
} from './providers'

beforeEach(() => {
  localStorage.clear()
})

describe('built-in registry', () => {
  it('has unique ids and the default exists', () => {
    const ids = BUILTIN_PROVIDERS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain(DEFAULT_PROVIDER_ID)
  })

  it('every provider is https, carries z/x/y placeholders and attribution', () => {
    for (const p of BUILTIN_PROVIDERS) {
      expect(p.urlTemplate, p.id).toMatch(/^https:\/\//)
      for (const ph of ['{z}', '{x}', '{y}']) expect(p.urlTemplate, p.id).toContain(ph)
      expect(p.attribution.length, p.id).toBeGreaterThan(0)
      expect(p.lastReviewed, p.id).toMatch(/^\d{4}-\d{2}$/)
    }
  })

  it('satellite providers are never license-clean silent defaults', () => {
    // Esri (non-revenue only) and EOX (CC-BY-NC) must force the terms sheet.
    expect(resolveProvider('esri-imagery')?.requiresTermsNotice).toBe(true)
    expect(resolveProvider('eox-s2')?.requiresTermsNotice).toBe(true)
    expect(DEFAULT_PROVIDER_ID).not.toBe('esri-imagery')
    expect(DEFAULT_PROVIDER_ID).not.toBe('eox-s2')
  })

  it('resolves built-ins by id and returns null for unknown ids', () => {
    expect(resolveProvider('osm')?.kind).toBe('streets')
    expect(resolveProvider('opentopomap')?.kind).toBe('topo')
    expect(resolveProvider('does-not-exist')).toBeNull()
  })
})

describe('validateCustomTemplate', () => {
  it('accepts a well-formed XYZ template (trimmed)', () => {
    const r = validateCustomTemplate('  https://tiles.example.com/{z}/{x}/{y}.png ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe('https://tiles.example.com/{z}/{x}/{y}.png')
  })

  it('accepts WMTS-REST order ({z}/{y}/{x})', () => {
    expect(validateCustomTemplate('https://wmts.example.com/layer/{z}/{y}/{x}.jpg').ok).toBe(true)
  })

  it('rejects http (TLS required)', () => {
    const r = validateCustomTemplate('http://tiles.example.com/{z}/{x}/{y}.png')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('httpsRequired')
  })

  it('rejects missing placeholders', () => {
    const r = validateCustomTemplate('https://tiles.example.com/{z}/{x}.png')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.message).toBe('missingPlaceholders')
  })

  it('rejects empty, whitespace-containing, and oversized templates', () => {
    expect(validateCustomTemplate('').ok).toBe(false)
    expect(validateCustomTemplate('https://a b.com/{z}/{x}/{y}').ok).toBe(false)
    expect(validateCustomTemplate(`https://t.example.com/${'a'.repeat(2100)}/{z}/{x}/{y}`).ok).toBe(false)
  })
})

describe('custom slot persistence', () => {
  it('save → resolve roundtrip', () => {
    const saved = saveCustomProvider('https://tiles.example.com/{z}/{x}/{y}.png', 'My Tiles © Me')
    expect(saved.ok).toBe(true)
    const p = resolveProvider('custom')
    expect(p?.urlTemplate).toBe('https://tiles.example.com/{z}/{x}/{y}.png')
    expect(p?.attribution).toBe('My Tiles © Me')
    expect(p?.kind).toBe('custom')
  })

  it('returns null when unset, corrupt, or cleared', () => {
    expect(loadCustomProvider()).toBeNull()
    localStorage.setItem('ifc-geo-custom-provider:v1', '{not json')
    expect(loadCustomProvider()).toBeNull()
    saveCustomProvider('https://tiles.example.com/{z}/{x}/{y}.png', '')
    clearCustomProvider()
    expect(loadCustomProvider()).toBeNull()
  })

  it('refuses to save an invalid template', () => {
    const r = saveCustomProvider('http://nope/{z}/{x}/{y}', '')
    expect(r.ok).toBe(false)
    expect(loadCustomProvider()).toBeNull()
  })

  it('falls back to a generic attribution when none was given', () => {
    saveCustomProvider('https://tiles.example.com/{z}/{x}/{y}.png', '   ')
    expect(loadCustomProvider()?.attribution).toContain('Custom tile source')
  })
})

describe('buildTileUrl', () => {
  it('substitutes z/x/y in XYZ order', () => {
    const p = resolveProvider('osm')!
    expect(buildTileUrl(p, 12, 2065, 1539)).toBe('https://tile.openstreetmap.org/12/2065/1539.png')
  })

  it('substitutes correctly for WMTS-REST ({z}/{y}/{x}) providers', () => {
    const p = resolveProvider('esri-imagery')!
    expect(buildTileUrl(p, 10, 511, 383)).toBe(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/10/383/511',
    )
  })

  it('pins {s} subdomain templates deterministically', () => {
    const p = { ...resolveProvider('osm')!, urlTemplate: 'https://{s}.tile.example.com/{z}/{x}/{y}.png' }
    expect(buildTileUrl(p, 1, 2, 3)).toBe('https://a.tile.example.com/1/2/3.png')
  })
})
