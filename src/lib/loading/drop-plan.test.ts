// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { followUp, holdsForReview, listNames, planDrop, plannedCount, type DropCaps } from './drop-plan'

const file = (name: string): File => new File(['x'], name)
const names = (files: readonly File[]): string[] => files.map((f) => f.name)
const ALL: DropCaps = { pointcloud: true, mesh: true, video: true, scene: true }
const plan = (list: string[], caps: Partial<DropCaps> = {}) => planDrop(list.map(file), { ...ALL, ...caps })
const on = { interactive: true }

describe('planDrop + followUp', () => {
  it('opens the panel of a single kind', () => {
    expect(followUp(plan(['scan.las']), on)).toEqual({ open: 'pointcloud', summary: [], show: null })
    expect(followUp(plan(['clip.mp4']), on).open).toBe('video')
  })

  it('treats a kind whose capability is off as unsupported', () => {
    const p = plan(['clip.mp4'], { video: false })
    expect(names(p.unsupported)).toEqual(['clip.mp4'])
    expect(plannedCount(p)).toBe(0)
  })

  it('hands weather files to the solar analysis only where it can open them', () => {
    const p = plan(['CAN_ON_Toronto.716240_CWEC2020.epw', 'x.ifc'], { weather: true })
    expect(names(p.weather)).toEqual(['CAN_ON_Toronto.716240_CWEC2020.epw'])
    expect(plannedCount(p)).toBe(2)
    // Off by default (the Add data hub does not offer them): unsupported, not lost.
    const off = plan(['CAN_ON_Toronto.716240_CWEC2020.epw'])
    expect(off.weather).toEqual([])
    expect(names(off.unsupported)).toEqual(['CAN_ON_Toronto.716240_CWEC2020.epw'])
    // A zip only counts when its name says weather.
    expect(names(plan(['ESP_CT_Barcelona.081810_TMYx.2009-2023.zip', 'photos.zip'], { weather: true }).weather))
      .toEqual(['ESP_CT_Barcelona.081810_TMYx.2009-2023.zip'])
  })

  it('summarises a mixed drop and shows the first kind', () => {
    const f = followUp(plan(['scan.las', 'clip.mp4']), on)
    expect(f.open).toBeNull()
    expect(names(f.summary)).toEqual(['scan.las', 'clip.mp4'])
    expect(f.show).toBe('pointcloud')
  })

  it('opens data layers in a mixed drop and summarises the rest', () => {
    const f = followUp(plan(['roads.geojson', 'scan.las']), on)
    expect(f.open).toBe('layers')
    expect(names(f.summary)).toEqual(['scan.las'])
    expect(f.show).toBe('pointcloud')
  })

  it('holds scans, meshes and videos for the IFC review', () => {
    expect(holdsForReview(plan(['x.ifc', 'scan.las']), false)).toBe(true)
    expect(holdsForReview(plan(['scan.las']), true)).toBe(true)
    expect(holdsForReview(plan(['x.ifc']), false)).toBe(false)
  })

  it('groups deferred scanner formats by reason', () => {
    const p = plan(['scan.e57', 'job.rcp'])
    expect(p.deferred.map((d) => [d.reasonKey, names(d.files)])).toEqual([
      ['unsupported.e57', ['scan.e57']],
      ['unsupported.proprietary', ['job.rcp']],
    ])
    expect(plannedCount(p)).toBe(0)
    expect(p.unsupported).toEqual([])
  })

  it('keeps every IDS (first active, the rest for the library) and one scene file', () => {
    const ids = plan(['a.ids', 'b.ids'])
    expect(ids.ids?.name).toBe('a.ids')
    expect(names(ids.moreIds)).toEqual(['b.ids'])
    expect(ids.unsupported).toEqual([])
    const scene = plan(['p.scene.json', 'q.scene.json'])
    expect(scene.scene?.name).toBe('p.scene.json')
    expect(names(scene.unsupported)).toEqual(['q.scene.json'])
    const embedded = plan(['p.scene.json'], { scene: false })
    expect(embedded.scene).toBeNull()
    expect(names(embedded.unsupported)).toEqual(['p.scene.json'])
  })

  it('refuses a sidecar-only mesh selection and keeps a full one together', () => {
    expect(names(plan(['model.bin', 'model.mtl']).unsupported)).toEqual(['model.bin', 'model.mtl'])
    const p = plan(['chair.glb', 'chair.bin', 'wood.png'])
    expect(p.mesh).toHaveLength(3)
    expect(followUp(p, on).open).toBe('mesh')
  })

  it('keeps the README next to an IFC out of the scans, as a project document', () => {
    const p = plan(['README.txt', 'x.ifc'])
    expect(p.pointcloud).toEqual([])
    expect(names(p.documents)).toEqual(['README.txt'])
  })

  it('keeps PDFs, office files and images as documents, and still refuses unknown files', () => {
    const p = plan(['x.ifc', 'Pliego.pdf', 'Mediciones.xlsx', 'foto.jpg', 'plano.dwg', 'thing.xyz123'])
    expect(names(p.documents).sort()).toEqual(['Mediciones.xlsx', 'Pliego.pdf', 'foto.jpg', 'plano.dwg'])
    expect(names(p.unsupported)).toEqual(['thing.xyz123'])
  })

  it('does nothing when the chrome is not interactive', () => {
    for (const list of [['scan.las'], ['scan.las', 'clip.mp4'], ['roads.geojson', 'scan.las']]) {
      expect(followUp(plan(list), { interactive: false })).toEqual({ open: null, summary: [], show: null })
    }
  })
})

describe('listNames', () => {
  it('names the first three and counts the rest', () => {
    expect(listNames(['a', 'b', 'c', 'd', 'e'].map(file), 3)).toEqual({ names: 'a, b, c', more: 2 })
    expect(listNames([file('a')])).toEqual({ names: 'a', more: 0 })
  })
})
