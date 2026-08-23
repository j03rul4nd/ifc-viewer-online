import { describe, it, expect } from 'vitest'
import { parsePanelTarget, parsePanelList } from './panel-commands'
import { ALL_PANEL_IDS } from './panel-rail'

describe('parsePanelTarget', () => {
  it('accepts a known panel', () => {
    expect(parsePanelTarget('map')).toBe('map')
  })

  it('reads null as "close whatever is open"', () => {
    // Distinct from an unknown id: one is an instruction, the other is noise.
    expect(parsePanelTarget(null)).toBeNull()
  })

  it('ignores an id it does not know instead of throwing', () => {
    // A host page written against a newer build must keep working here.
    expect(parsePanelTarget('teleporter')).toBeUndefined()
  })

  it('ignores anything that is not a string', () => {
    // postMessage carries whatever the sender put in it.
    for (const junk of [42, {}, [], undefined, true]) {
      expect(parsePanelTarget(junk), String(junk)).toBeUndefined()
    }
  })

  it('is forgiving about case and spacing, as the URL form is', () => {
    expect(parsePanelTarget(' Map ')).toBe('map')
  })
})

describe('parsePanelList', () => {
  it('accepts the array a script would send', () => {
    expect(parsePanelList(['scene', 'map'])).toEqual(['scene', 'map'])
  })

  it('accepts the comma string a URL would', () => {
    expect(parsePanelList('scene,map')).toEqual(['scene', 'map'])
  })

  it('returns rail order, not the order the host typed', () => {
    // Two hosts asking for the same tools must get the same rail.
    expect(parsePanelList(['map', 'scene'])).toEqual(parsePanelList(['scene', 'map']))
  })

  it('drops names it does not know', () => {
    expect(parsePanelList(['scene', 'teleporter'])).toEqual(['scene'])
  })

  it('distinguishes "no rail" from "no change"', () => {
    // An empty array is an instruction; a non-list is the absence of one.
    expect(parsePanelList([])).toEqual([])
    expect(parsePanelList(undefined)).toBeUndefined()
    expect(parsePanelList(42)).toBeUndefined()
  })

  it('knows every panel the rail knows', () => {
    // If a panel is added to the rail and not here, a host cannot name it.
    expect(parsePanelList([...ALL_PANEL_IDS])).toEqual([...ALL_PANEL_IDS])
  })
})
