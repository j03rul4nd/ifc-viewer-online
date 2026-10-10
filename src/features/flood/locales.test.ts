// @vitest-environment node
/// <reference types="node" />
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const load = (lng: string): Record<string, unknown> => JSON.parse(readFileSync(join(here, 'locales', `${lng}.json`), 'utf-8'))

function keys(o: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('flood locales', () => {
  const en = keys(load('en')).sort()

  it('every language has the same keys as English', () => {
    for (const f of readdirSync(join(here, 'locales'))) {
      const lng = f.replace('.json', '')
      expect(keys(load(lng)).sort(), lng).toEqual(en)
    }
  })

  it('every literal key the UI asks for exists', () => {
    const known = new Set(en)
    // Prefix keys built with a template (t(`rain.presets.${p}`)) are checked by their prefix.
    const prefixes = new Set(en.map((k) => k.slice(0, k.lastIndexOf('.') + 1)))
    const missing: string[] = []
    for (const f of readdirSync(join(here, 'ui'))) {
      const src = readFileSync(join(here, 'ui', f), 'utf-8')
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.-]+)'/g)) if (!known.has(m[1])) missing.push(`${f}: ${m[1]}`)
      for (const m of src.matchAll(/\bt\(\s*`([a-zA-Z0-9_.-]+\.)\$\{/g)) if (!prefixes.has(m[1])) missing.push(`${f}: ${m[1]}*`)
    }
    expect(missing).toEqual([])
  })
})
