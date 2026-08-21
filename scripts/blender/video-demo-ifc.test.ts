import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve('public/models/video-demo')
const ifcPath = path.join(root, 'IVO-Operations-Pavilion.ifc')
const videoPath = path.join(root, 'operations-pavilion-progress.mp4')
const posterPath = path.join(root, 'operations-pavilion-poster.jpg')

function count(source: string, entity: string): number {
  return (source.match(new RegExp(`=${entity}\\(`, 'g')) ?? []).length
}

describe('IFC + video exhibition fixture', () => {
  const ifc = fs.readFileSync(ifcPath, 'utf8').toUpperCase()

  it('is an IFC4 pavilion with the intended physical elements', () => {
    expect(ifc).toContain("FILE_SCHEMA(('IFC4'))")
    expect(count(ifc, 'IFCCOLUMN')).toBe(6)
    expect(count(ifc, 'IFCBEAM')).toBe(2)
    expect(count(ifc, 'IFCSLAB')).toBe(2)
    expect(count(ifc, 'IFCWALL')).toBe(0)
    expect(ifc).toContain('OPERATIONS-PAVILION-PROGRESS.MP4')
  })

  it('ships a compact MP4 and JPEG poster rather than network placeholders', () => {
    const video = fs.readFileSync(videoPath)
    const poster = fs.readFileSync(posterPath)
    expect(video.length).toBeGreaterThan(100_000)
    expect(video.subarray(4, 8).toString('ascii')).toBe('ftyp')
    expect(poster.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
  })
})
