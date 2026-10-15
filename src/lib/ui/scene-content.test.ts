// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { hasSceneContent, type SceneContentCounts } from './scene-content'

const zero: SceneContentCounts = { models: 0, clouds: 0, meshes: 0, videos: 0, layers: 0 }

describe('hasSceneContent', () => {
  it('is false for an empty scene', () => {
    expect(hasSceneContent(zero)).toBe(false)
  })
  it.each(Object.keys(zero) as (keyof SceneContentCounts)[])('is true with only %s', (key) => {
    expect(hasSceneContent({ ...zero, [key]: 1 })).toBe(true)
  })
})
