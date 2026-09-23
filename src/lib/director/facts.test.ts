import { describe, expect, it } from 'vitest'
import { isPlaceholderName, presentableName, shortTitle } from './facts'

describe('presentableName', () => {
  it('prefers the project name the authors gave', () => {
    expect(presentableName({ project: 'Torre Poblenou', building: 'Tower' }, 'BCN-IVO-ZZ-XX-M3-Z-0002.ifc')).toBe('Torre Poblenou')
  })

  it('falls back to the building, then the tidied file name', () => {
    expect(presentableName({ project: 'Project', building: 'Hotel Vela' }, 'x.ifc')).toBe('Hotel Vela')
    expect(presentableName({ project: 'Default', building: null }, 'My_Model-v2.ifc')).toBe('My Model v2')
  })

  it('recognises placeholders', () => {
    for (const n of ['Project', 'proyecto', '0001', '#12', 'Unnamed', ' ', 'IFC Project']) expect(isPlaceholderName(n)).toBe(true)
    for (const n of ['Torre Poblenou', 'Hospital Norte', 'Duplex A']) expect(isPlaceholderName(n)).toBe(false)
  })

  it('cuts long descriptive names at the first clause', () => {
    expect(shortTitle('Torre Poblenou - reference tower model, Barcelona 22@')).toBe('Torre Poblenou')
    expect(shortTitle('Hospital Norte')).toBe('Hospital Norte')
    expect(shortTitle('A'.repeat(60)).endsWith('…')).toBe(true)
  })
})
