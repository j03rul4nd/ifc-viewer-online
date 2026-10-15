// @vitest-environment node
// ─── drop routing tests ───────────────────────────────────────────────────────
// The router copies two extension lists instead of importing them (see the
// header of drop-routing.ts). The parity block below is what makes that copy
// safe: it imports the real modules — tests may; the entry chunk may not — and
// fails the day someone teaches the point-cloud or mesh importer a new format
// without telling the global drop.

import { describe, it, expect } from 'vitest'
import {
  classifyFiles,
  fileExtensionOf,
  groupMeshFiles,
  hasFilePayload,
  isWeatherZipName,
  routedCount,
  MESH_ENTRY_EXTENSIONS,
  MESH_SIDECAR_EXTENSIONS,
  MESH_TEXTURE_EXTENSIONS,
  POINTCLOUD_EXTENSIONS,
  isSceneFileName,
} from './drop-routing'
import { VIDEO_ACCEPT, VIDEO_FILE_EXTENSIONS } from '../video/video-types'
import pcTypesSource from '../pointcloud/pc-types.ts?raw'
import videoTypesSource from '../video/video-types.ts?raw'
import { acceptAttribute } from '../pointcloud/pc-format'
import { MESH_EXTENSIONS } from '../mesh/mesh-types'

const file = (name: string): File => new File(['x'], name)
const names = (files: File[]): string[] => files.map((f) => f.name)

describe('fileExtensionOf', () => {
  it('lower-cases the last extension', () => {
    expect(fileExtensionOf('Hotel_Vela_ARC.IFC')).toBe('.ifc')
    expect(fileExtensionOf('scan.copc.laz')).toBe('.laz')
  })

  it('has no extension for bare or hidden names', () => {
    expect(fileExtensionOf('README')).toBe('')
    expect(fileExtensionOf('.DS_Store')).toBe('')
    expect(fileExtensionOf('  model.ifc  ')).toBe('.ifc')
  })
})

describe('classifyFiles', () => {
  it('routes a mixed project drop to every subsystem', () => {
    const r = classifyFiles([
      file('Tower_ARC.ifc'), file('client.ids'), file('issues.bcfzip'), file('old.bcf'),
      file('site.copc.laz'), file('points.xyz'), file('model.glb'), file('notes.docx'),
      file('Tower_STR.IFC'),
    ])
    expect(names(r.ifc)).toEqual(['Tower_ARC.ifc', 'Tower_STR.IFC'])
    expect(names(r.ids)).toEqual(['client.ids'])
    expect(names(r.bcf)).toEqual(['issues.bcfzip', 'old.bcf'])
    expect(names(r.pointcloud)).toEqual(['site.copc.laz', 'points.xyz'])
    expect(names(r.mesh)).toEqual(['model.glb'])
    expect(names(r.other)).toEqual(['notes.docx'])
    expect(routedCount(r)).toBe(8)
  })

  it('keeps arrival order inside a bucket (the anchor rule depends on it)', () => {
    const r = classifyFiles([file('b.ifc'), file('a.ifc'), file('c.ifc')])
    expect(names(r.ifc)).toEqual(['b.ifc', 'a.ifc', 'c.ifc'])
  })

  it('only treats images as textures when a mesh entry file is in the drop', () => {
    const withEntry = classifyFiles([file('wall.jpg'), file('scene.gltf'), file('scene.bin')])
    expect(names(withEntry.mesh)).toEqual(['scene.gltf', 'scene.bin', 'wall.jpg'])
    expect(withEntry.other).toEqual([])

    const screenshotOnly = classifyFiles([file('Tower.ifc'), file('screenshot.png')])
    expect(names(screenshotOnly.other)).toEqual(['screenshot.png'])
    expect(screenshotOnly.mesh).toEqual([])
  })

  it('routes lone mesh sidecars to the mesh loader (it explains the missing entry)', () => {
    const r = classifyFiles([file('materials.mtl')])
    expect(names(r.mesh)).toEqual(['materials.mtl'])
  })

  it('does not take .xml as IDS', () => {
    const r = classifyFiles([file('spec.xml')])
    expect(r.ids).toEqual([])
    expect(names(r.other)).toEqual(['spec.xml'])
  })

  it('returns empty buckets for an empty drop', () => {
    const r = classifyFiles([])
    expect(routedCount(r)).toBe(0)
    expect(r.other).toEqual([])
    expect(r.weather).toEqual([])
  })
})

describe('classifyFiles — weather files', () => {
  it('routes an .epw to the weather bucket, next to its IFC', () => {
    const r = classifyFiles([file('Tower.ifc'), file('CAN_ON_Toronto.Intl.AP.716240_CWEC2020.EPW')])
    expect(names(r.ifc)).toEqual(['Tower.ifc'])
    expect(names(r.weather)).toEqual(['CAN_ON_Toronto.Intl.AP.716240_CWEC2020.EPW'])
    expect(routedCount(r)).toBe(2)
  })

  it('takes a zip only when its name says weather', () => {
    const r = classifyFiles([
      file('CAN_ON_Toronto.Intl.AP.716240_TMYx.2009-2023.zip'),
      file('USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.zip'),
      file('project-files.zip'),
    ])
    expect(names(r.weather)).toEqual([
      'CAN_ON_Toronto.Intl.AP.716240_TMYx.2009-2023.zip',
      'USA_IL_Chicago-OHare.Intl.AP.725300_TMY3.zip',
    ])
    expect(names(r.other)).toEqual(['project-files.zip'])
  })
})

describe('isWeatherZipName', () => {
  it('knows the dataset tags as tokens of their own', () => {
    for (const n of ['x_TMYx.zip', 'x_TMY3.zip', 'x_tmy.zip', 'CAN_ON_Ottawa_CWEC.zip', 'ESP_Madrid_IWEC2.zip', 'site epw.zip', 'EPW.ZIP']) {
      expect(isWeatherZipName(n), n).toBe(true)
    }
  })

  it('does not guess from a substring, and only for zips', () => {
    for (const n of ['Tmyrsk.zip', 'weather.zip', 'models.zip', 'x_TMYx.epw', 'x_TMYx.zip.txt', 'x_TMYx']) {
      expect(isWeatherZipName(n), n).toBe(false)
    }
  })
})

describe('classifyFiles — ambiguous text files', () => {
  it('a README / CSV next to IFCs is not a scan', () => {
    const r = classifyFiles([file('ARC.ifc'), file('README.txt'), file('issues.csv')])
    expect(names(r.pointcloud)).toEqual([])
    expect(names(r.other)).toEqual(['README.txt', 'issues.csv'])
    expect(names(r.ifc)).toEqual(['ARC.ifc'])
  })

  it('stays a scan alone, beside other scans, or with no model in the drop', () => {
    expect(names(classifyFiles([file('points.csv')]).pointcloud)).toEqual(['points.csv'])
    expect(names(classifyFiles([file('ARC.ifc'), file('site.laz'), file('extra.txt')]).pointcloud)).toEqual(['site.laz', 'extra.txt'])
    expect(names(classifyFiles([file('a.xyz'), file('b.csv')]).pointcloud)).toEqual(['a.xyz', 'b.csv'])
    // A mesh entry makes the context a model folder too.
    expect(names(classifyFiles([file('chair.glb'), file('notes.txt')]).other)).toEqual(['notes.txt'])
  })
})

describe('groupMeshFiles', () => {
  it('makes one import per entry file, sharing every sidecar', () => {
    const groups = groupMeshFiles([file('chair.glb'), file('table.obj'), file('table.mtl'), file('wood.png'), file('chair.bin')])
    expect(groups.map((g) => g.entry.name)).toEqual(['chair.glb', 'table.obj'])
    for (const g of groups) expect(names(g.sidecars)).toEqual(['table.mtl', 'wood.png', 'chair.bin'])
  })

  it('keeps the arrival order of the entries (batch naming follows it)', () => {
    expect(groupMeshFiles([file('b.GLB'), file('a.gltf')]).map((g) => g.entry.name)).toEqual(['b.GLB', 'a.gltf'])
  })

  it('has nothing to import without an entry file', () => {
    expect(groupMeshFiles([file('model.bin'), file('model.mtl')])).toEqual([])
    expect(groupMeshFiles([])).toEqual([])
  })
})

describe('hasFilePayload', () => {
  it('reads types during dragover, when files is still empty', () => {
    expect(hasFilePayload({ types: ['Files'] })).toBe(true)
    expect(hasFilePayload({ types: ['text/plain', 'Files'] })).toBe(true)
  })

  it('ignores internal and text drags', () => {
    expect(hasFilePayload({ types: ['application/x-scene-item'] })).toBe(false)
    expect(hasFilePayload({ types: ['text/plain'], items: [{ kind: 'string' }] })).toBe(false)
    expect(hasFilePayload(null)).toBe(false)
    expect(hasFilePayload(undefined)).toBe(false)
  })

  it('falls back to item kinds', () => {
    expect(hasFilePayload({ types: [], items: [{ kind: 'file' }] })).toBe(true)
  })
})

describe('extension parity with the importers', () => {
  it('point clouds match pc-format EXTENSION_FORMATS', () => {
    const source = acceptAttribute().split(',').sort()
    expect([...POINTCLOUD_EXTENSIONS].sort()).toEqual(source)
  })

  it('meshes match mesh-types MESH_EXTENSIONS', () => {
    const mirrored = [...MESH_ENTRY_EXTENSIONS, ...MESH_SIDECAR_EXTENSIONS, ...MESH_TEXTURE_EXTENSIONS]
    expect(mirrored.sort()).toEqual([...MESH_EXTENSIONS].sort())
  })
})

describe('classifyFiles — video, scene and deferred buckets', () => {
  it('routes every video container to video, in arrival order, and counts it', () => {
    const r = classifyFiles(['clip.MP4', 'drone.mov', 'a.webm', 'b.ogv', 'c.ogg', 'd.m4v'].map(file))
    expect(names(r.video)).toEqual(['clip.MP4', 'drone.mov', 'a.webm', 'b.ogv', 'c.ogg', 'd.m4v'])
    expect(routedCount(r)).toBe(6)
  })

  it('recognises *.scene.json by suffix and leaves a plain .json in other', () => {
    expect(names(classifyFiles([file('Plaza.SCENE.JSON')]).scene)).toEqual(['Plaza.SCENE.JSON'])
    expect(names(classifyFiles([file('config.json')]).other)).toEqual(['config.json'])
    expect(isSceneFileName('  a.scene.json ')).toBe(true)
    expect(isSceneFileName('scene.json')).toBe(false)
  })

  it('puts scanner formats it cannot decode in deferred — never pointcloud or other, never counted', () => {
    const r = classifyFiles(['a.e57', 'b.rcp', 'c.rcs', 'd.fls', 'e.zfs'].map(file))
    expect(names(r.deferred)).toEqual(['a.e57', 'b.rcp', 'c.rcs', 'd.fls', 'e.zfs'])
    expect(r.pointcloud).toEqual([])
    expect(r.other).toEqual([])
    expect(routedCount(r)).toBe(0)
  })

  it('treats text next to a video or a scene file as the README it is', () => {
    expect(names(classifyFiles([file('clip.mp4'), file('notes.txt')]).other)).toEqual(['notes.txt'])
    expect(names(classifyFiles([file('x.scene.json'), file('README.txt')]).other)).toEqual(['README.txt'])
    expect(names(classifyFiles([file('a.xyz'), file('b.csv')]).pointcloud)).toEqual(['a.xyz', 'b.csv'])
  })
})

describe('import-free extension modules', () => {
  // drop-routing.ts lives in the entry chunk and imports these two modules for
  // their extension tables. A value import in either would pull its target
  // into the entry chunk; types and `as const` tables only.
  it.each([
    ['pc-types.ts', pcTypesSource],
    ['video-types.ts', videoTypesSource],
  ])('%s has no value imports', (_name, source) => {
    const offending = source.split(/\r?\n/).filter((line) => /^import (?!type)/.test(line))
    expect(offending).toEqual([])
  })

  it('VIDEO_ACCEPT keeps the old MIME list and names every routed extension', () => {
    expect(VIDEO_ACCEPT.startsWith('video/mp4,video/webm,video/ogg')).toBe(true)
    const parts = VIDEO_ACCEPT.split(',')
    for (const ext of VIDEO_FILE_EXTENSIONS) expect(parts).toContain(ext)
  })
})
