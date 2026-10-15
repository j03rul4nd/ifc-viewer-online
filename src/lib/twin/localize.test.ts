import { describe, expect, it } from 'vitest'
import { cleanNames, localName, localizeBindings } from './localize'
import type { Binding, TwinRule } from './devices'

const rule = (id: string, name: string, names?: Record<string, string>): TwinRule =>
  ({ id, name, names, match: 'all', filters: [], effect: { color: '#22c55e', opacity: 1, hide: false } })

const binding = (rules: TwinRule[], names?: Record<string, string>): Binding =>
  ({ id: 'b', name: 'Dock posts', names, sourceId: 's', deviceId: '65', targets: [], rules, staleColor: null, staleAfterS: 0 })

describe('twin names in the reader\'s language', () => {
  it('picks the language, then its base, then the name', () => {
    const item = { name: 'Few bikes', names: { es: 'Pocas bicis', pt: 'Poucas bicicletas' } }
    expect(localName(item, 'es')).toBe('Pocas bicis')
    expect(localName(item, 'pt-BR')).toBe('Poucas bicicletas')
    expect(localName(item, 'ja')).toBe('Few bikes')
    expect(localName({ name: 'Plain' }, 'es')).toBe('Plain')
  })

  it('renames bindings and rules, and leaves ids, effects and untranslated objects alone', () => {
    const plain = binding([rule('r0', 'On')])
    const named = binding([rule('r1', 'Few bikes', { es: 'Pocas bicis' }), rule('r2', 'Full')], { es: 'Anclajes' })
    const [p, n] = localizeBindings([plain, named], 'es')
    expect(p).toBe(plain)
    expect(n.name).toBe('Anclajes')
    expect(n.rules.map((r) => r.name)).toEqual(['Pocas bicis', 'Full'])
    expect(n.rules[0].id).toBe('r1')
    expect(n.rules[0].effect).toBe(named.rules[0].effect)
    expect(n.rules[1]).toBe(named.rules[1])
    // The store's objects are never mutated.
    expect(named.name).toBe('Dock posts')
    expect(localizeBindings([named], 'de')[0]).toBe(named)
  })

  it('keeps only well-formed translations from a hand-edited file', () => {
    expect(cleanNames({ es: ' Pocas ', 'pt-BR': 'Poucas', bad: 3, '': 'x', 'not a lang': 'y', ja: '' })).toEqual({ es: 'Pocas', 'pt-BR': 'Poucas' })
    expect(cleanNames(['es'])).toBeUndefined()
    expect(cleanNames('es')).toBeUndefined()
    expect(cleanNames({})).toBeUndefined()
  })
})
