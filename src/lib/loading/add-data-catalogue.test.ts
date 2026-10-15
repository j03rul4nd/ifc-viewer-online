// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { acceptFor, addDataCatalogue, dropLegend, formatCodes, type AddDataFlags } from './add-data-catalogue'
import { LAYER_FILE_ACCEPT, POINTCLOUD_EXTENSIONS } from './drop-routing'
import { VIDEO_ACCEPT } from '../video/video-types'
import en from '../../locales/en/toolbar.json'

const ALL: AddDataFlags = { pointcloud: true, video: true, mesh: true, gis: true }
/** .env.example defaults: point cloud, video and GIS on; mesh off. */
const DEFAULTS: AddDataFlags = { ...ALL, mesh: false }

describe('addDataCatalogue', () => {
  it('orders the cards by intent, with their groups', () => {
    const cards = addDataCatalogue(ALL)
    expect(cards.map((c) => c.kind)).toEqual(['pointcloud', 'video', 'ifc', 'mesh', 'map', 'layers', 'devices', 'scene'])
    expect(cards.map((c) => c.group)).toEqual(['capture', 'capture', 'models', 'models', 'context', 'context', 'context', 'scenes'])
  })

  it('has 7 cards with the default flags', () => {
    expect(addDataCatalogue(DEFAULTS)).toHaveLength(7)
  })

  it.each([['pointcloud'], ['video'], ['mesh'], ['gis']] as const)('drops a card when %s is off', (flag) => {
    const kinds = addDataCatalogue({ ...ALL, [flag]: false }).map((c) => c.kind)
    expect(kinds).toHaveLength(7)
    expect(kinds).not.toContain(flag === 'gis' ? 'map' : flag)
  })

  it('only the map needs a model', () => {
    expect(addDataCatalogue(ALL).filter((c) => c.needsModel).map((c) => c.kind)).toEqual(['map'])
  })

  it('has EN copy for every card', () => {
    const cards = (en as { addData: { cards: Record<string, { title?: string; desc?: string }> } }).addData.cards
    for (const card of addDataCatalogue(ALL)) {
      expect(cards[card.kind]?.title, card.kind).toBeTruthy()
      expect(cards[card.kind]?.desc, card.kind).toBeTruthy()
    }
  })
})

describe('acceptFor', () => {
  it('ties every picker to the routing tables', () => {
    expect(acceptFor('pointcloud', ALL).split(',')).toEqual([...POINTCLOUD_EXTENSIONS])
    expect(acceptFor('video', ALL)).toBe(VIDEO_ACCEPT)
    expect(acceptFor('layers', ALL)).toBe(LAYER_FILE_ACCEPT)
    expect(acceptFor('scene', ALL)).toBe('.json,application/json')
  })

  it('accepts every routed kind in the catch-all picker, honouring flags', () => {
    const parts = acceptFor('any', DEFAULTS).split(',')
    for (const ext of ['.ifc', '.ids', '.laz', '.mp4', '.geojson', '.json']) expect(parts).toContain(ext)
    expect(parts).not.toContain('.glb')
    expect(acceptFor('any', ALL).split(',')).toContain('.glb')
  })
})

describe('dropLegend and formatCodes', () => {
  it('leaves out flag-off kinds', () => {
    expect(dropLegend(DEFAULTS).map((r) => r.kind)).toEqual(['ifc', 'pointcloud', 'video', 'layers', 'scene'])
  })

  it('upper-cases extensions but keeps the scene suffix literal', () => {
    expect(formatCodes(['.las', '.scene.json'])).toEqual(['LAS', '.scene.json'])
  })
})
