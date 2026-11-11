import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import catalogue from './port-library.json'
import { portCategories, portDemoSet, searchPort, type PortObject } from './port-library'

const all = catalogue as PortObject[]

describe('Port de Barcelona library', () => {
  it('every object we offer as hosted is really there', () => {
    const hosted = all.filter((o) => o.file)
    expect(hosted.length).toBeGreaterThan(400)
    for (const o of hosted) expect(existsSync(`public/models/port-bcn/${o.file}`), o.file).toBe(true)
  })
  it('searches without accents, by word, within a category', () => {
    const cat = portCategories(all)[0]
    expect(searchPort(all, '', cat).every((o) => o.category === cat)).toBe(true)
    expect(searchPort(all, 'zzzz', null)).toEqual([])
    expect(searchPort([{ ...all[0], name: 'Grúa Móvil' }], 'grua movil', null)).toHaveLength(1)
  })
  it('only a hosted object becomes a demo, with its source named', () => {
    const o = all.find((x) => x.file)!
    expect(portDemoSet(o)?.models[0].sourceLabel).toContain('CC BY')
    expect(portDemoSet({ ...o, file: undefined })).toBeNull()
  })
})
