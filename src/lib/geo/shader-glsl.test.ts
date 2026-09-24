// ─── shader-glsl tests ────────────────────────────────────────────────────────
// A GLSL compile error in an onBeforeCompile patch does not fail anything a
// unit test runs: there is no WebGL here, and in the browser three logs it and
// draws nothing. That is how the procedural facade shipped a parameter named
// `half` — reserved in GLSL ES 3.00 — and every building in the city vanished
// while still casting its shadow (the depth pass uses its own shader).
//
// So the patched sources are checked here for the mistakes a compiler would
// reject that a reader skims past: reserved words used as names, and tokens the
// patch expects to find but three no longer emits.

import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { createFacadeMaterial } from './facade-shader'
import { createBarrierMaterial } from './street-furniture'

/** GLSL ES 3.00 §3.8: reserved for future use — illegal as identifiers. */
const RESERVED = [
  'attribute', 'varying', 'coherent', 'volatile', 'restrict', 'readonly', 'writeonly',
  'resource', 'atomic_uint', 'noperspective', 'patch', 'sample', 'subroutine', 'common',
  'partition', 'active', 'asm', 'class', 'union', 'enum', 'typedef', 'template', 'this',
  'goto', 'inline', 'noinline', 'public', 'static', 'extern', 'external', 'interface',
  'long', 'short', 'double', 'half', 'fixed', 'unsigned', 'superp', 'input', 'output',
  'hvec2', 'hvec3', 'hvec4', 'dvec2', 'dvec3', 'dvec4', 'fvec2', 'fvec3', 'fvec4',
  'sampler3DRect', 'filter', 'sizeof', 'cast', 'namespace', 'using',
]

/** Run a material's patch over three's REAL shader sources, return the result. */
function patched(material: THREE.Material): { vertexShader: string; fragmentShader: string } {
  const lib = THREE.ShaderLib.standard
  const shader = {
    uniforms: THREE.UniformsUtils.clone(lib.uniforms),
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  }
  material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer)
  return shader
}

/** The GLSL a patch ADDED — the lines not present in three's own source. */
function added(original: string, result: string): string {
  const keep = new Set(original.split('\n').map((l) => l.trim()))
  return result.split('\n').filter((l) => !keep.has(l.trim())).join('\n')
}

describe.each([
  ['facade', () => createFacadeMaterial()],
  ['barrier', () => createBarrierMaterial()],
])('%s shader patch', (_name, make) => {
  const lib = THREE.ShaderLib.standard
  const out = patched(make())
  const code = added(lib.vertexShader, out.vertexShader) + '\n' + added(lib.fragmentShader, out.fragmentShader)
  // Comments and the declaration keywords the patch legitimately writes.
  const body = code.replace(/\/\/.*$/gm, '').replace(/^\s*(attribute|varying)\s/gm, ' ')

  it('names nothing with a word GLSL ES reserves', () => {
    const words = new Set(body.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
    const hits = RESERVED.filter((w) => w !== 'common' && words.has(w))
    expect(hits).toEqual([])
  })

  it('actually changed both stages it meant to', () => {
    expect(out.fragmentShader).not.toBe(lib.fragmentShader)
    expect(out.vertexShader).not.toBe(lib.vertexShader)
  })

  it('balances its braces', () => {
    const count = (c: string) => (out.fragmentShader.match(new RegExp(`\\${c}`, 'g')) ?? []).length
    expect(count('{')).toBe(count('}'))
  })
})
