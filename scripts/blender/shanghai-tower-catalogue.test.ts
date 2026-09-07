// @vitest-environment node
import {readFileSync,statSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {describe,it,expect} from 'vitest'
import {DEMO_MODELS} from '../../src/demo-models/models'

describe('Shanghai Tower reconstruction release',()=>{
 it('publishes the validated revision, attribution and exact size',()=>{
  const model=DEMO_MODELS.find(m=>m.id==='shanghai-tower')!
  expect(model).toBeDefined()
  expect(model.description).toContain('Approximate reconstruction')
  expect(model.ifcUrl).toContain('?v=20260907-r1')
  const path=`public/models/shanghai-tower/${model.fileName}`
  expect(model.sizeBytes).toBe(statSync(path).size)
  const bytes=readFileSync(path),report=JSON.parse(readFileSync('public/models/shanghai-tower/validation.json','utf8'))
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(report.sha256)
  expect(report.expressErrors).toBe(0)
  expect(bytes.toString()).not.toContain('\r')
 })
 it('keeps the two skins, crown void and reference hierarchy distinct',()=>{
  const report=JSON.parse(readFileSync('public/models/shanghai-tower/geometry-validation.json','utf8'))
  expect(report.storeys).toBe(133)
  expect(report.outerSectors).toBe(384)
  expect(report.innerSkins).toBe(112)
  expect(report.coreVoidHits).toBe(0)
  expect(report.crownHits).toBe(0)
  expect(report.max[2]).toBeGreaterThan(631.8)
  expect(report.max[2]).toBeLessThan(632.25)
 })
})
