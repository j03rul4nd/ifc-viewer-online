import {describe,it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {SHANGHAI_PARK_ASSETS,SHANGHAI_PARK_ASSETS_KB} from '../../src/lib/geo/props-assets'
describe('Blender Shanghai landscape pack',()=>{
  it('ships bounded, coloured Z-up meshes at metre scale with an accurate download size',()=>{
    let bytes=0
    for(const name of SHANGHAI_PARK_ASSETS){
      const buf=readFileSync(`public/models/props/shanghai/${name}.glb`);bytes+=buf.length
      expect(buf.subarray(0,4).toString()).toBe('glTF')
      const gltf=JSON.parse(buf.subarray(20,20+buf.readUInt32LE(12)).toString())
      expect(gltf.meshes).toHaveLength(1)
      const prim=gltf.meshes[0].primitives[0]
      expect(prim.attributes.COLOR_0).toBeDefined()
      const pos=gltf.accessors[prim.attributes.POSITION]
      expect(pos.min[2]).toBeGreaterThanOrEqual(-.05)
      expect(pos.max[2]).toBeLessThan(14)
      const triangles=gltf.accessors[prim.indices].count/3
      expect(triangles).toBeLessThan(4000)
    }
    expect(bytes/1024).toBeGreaterThan(SHANGHAI_PARK_ASSETS_KB*.95)
    expect(bytes/1024).toBeLessThan(SHANGHAI_PARK_ASSETS_KB*1.05)
  })
})
