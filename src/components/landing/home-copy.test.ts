import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { HOME_COPY, HOME_LANGS, PATH_ORDER, PRIMARY_FEATURES, pathHref } from './home-copy'

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

describe('home page copy', () => {
  it('every language has a result headline and the three paths, in delivery order', () => {
    expect(PATH_ORDER).toEqual(['deliver', 'receive', 'build'])
    for (const l of HOME_LANGS) {
      const c = HOME_COPY[l]
      expect(c.h1.length, l).toBeGreaterThan(10)
      expect(c.h1, l).not.toMatch(/^IFC Viewer Online$/)
      for (const id of PATH_ORDER) for (const k of ['who', 'title', 'body', 'cta'] as const) expect(c.paths[id][k].trim(), `${l}.${id}.${k}`).not.toBe('')
    }
  })

  it('paths lead to pages that exist (no dead links)', () => {
    for (const l of HOME_LANGS) for (const id of PATH_ORDER) {
      const href = pathHref(id, l)
      if (href === null) continue
      const [p, hash] = href.split('#')
      const file = path.join(ROOT, 'public', p, 'index.html')
      expect(existsSync(file), `${l}: ${href}`).toBe(true)
      if (hash) expect(readFileSync(file, 'utf8'), `${l}: #${hash}`).toContain(`id="${hash}"`)
    }
  })

  it('six features get a card, the rest a compact list', () => {
    const features = JSON.parse(read('src/locales/en/landing.json')).features as unknown[]
    expect(PRIMARY_FEATURES.length).toBe(6)
    for (const i of PRIMARY_FEATURES) expect(features[i]).toBeTruthy()
  })

  it('the home page no longer offers contract work', () => {
    const src = read('src/components/Landing.tsx')
    expect(src).not.toMatch(/mailto:|contactForWork/)
    for (const l of HOME_LANGS) {
      const body = JSON.parse(read(`src/locales/${l}/landing.json`)).openSource.body as string
      expect(body, l).not.toMatch(/contract|contrato|Auftragsarbeit|missions|contratto|contracte|合同|契約|สัญญา/)
    }
  })

  it('the headline is rendered from this module, and the paths sit before the feature list', () => {
    const src = read('src/components/Landing.tsx')
    expect(src).toContain('{HOME_COPY[homeLang(langShort)].h1}')
    expect(src.indexOf('<ProfilePaths')).toBeGreaterThan(0)
    expect(src.indexOf('<ProfilePaths')).toBeLessThan(src.indexOf('id="features"'))
  })
})
