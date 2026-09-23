import { describe, expect, it } from 'vitest'
import { BED_RHYTHM, planAutoEdit, PLATFORMS, PLATFORM_SPECS } from './auto-edit'
import { addSource, createProject, layoutClips, setAllTransitions, type MediaSource } from './project'

const bounds = { center: { x: 0, y: 8, z: 0 }, size: { x: 30, y: 16, z: 20 } }

describe('planAutoEdit', () => {
  it('fits each platform\'s length and aspect', () => {
    const reel = planAutoEdit('reel', bounds, { name: 'Tower' })
    expect(reel.durationSec).toBe(15)
    expect(reel.shots.every((s) => s.aspect === 9 / 16)).toBe(true)
    const li = planAutoEdit('linkedin', bounds, { name: 'Tower' })
    expect(li.durationSec).toBe(25)
    expect(li.shots[0].aspect).toBe(4 / 5)
  })

  it('every cut lands on a beat of the platform\'s music once the clips are laid out', () => {
    for (const platform of PLATFORMS) {
      const plan = planAutoEdit(platform, bounds, { name: 'X' })
      const beat = BED_RHYTHM[plan.spec.bed].beatSec
      let p = createProject()
      plan.shots.forEach((s, i) => {
        const src: MediaSource = { id: `s${i}`, kind: 'shot', label: '', durationSec: s.durationSec, width: 1080, height: 1920 }
        p = addSource(p, src)
      })
      p = setAllTransitions(p, plan.spec.transition, plan.spec.transitionSec)
      for (const placed of layoutClips(p).slice(1)) {
        const beats = placed.start / beat
        expect(Math.abs(beats - Math.round(beats)), `${platform} cut at ${placed.start}`).toBeLessThan(1e-6)
      }
    }
  })

  it('shows only real facts: no Health Score unless the model was validated', () => {
    const without = planAutoEdit('reel', bounds, { name: 'A', elementCount: 1200, storeyCount: 4 })
    expect(without.texts.some((t) => t.text.includes('Health Score'))).toBe(false)
    expect(without.texts.some((t) => t.text.includes('1,200 elements · 4 storeys'))).toBe(true)
    const withScore = planAutoEdit('reel', bounds, { name: 'A', healthScore: 91.6 })
    expect(withScore.texts.some((t) => t.text === 'Health Score 92/100')).toBe(true)
  })

  it('keeps Reel and TikTok captions out of the bottom third the app covers', () => {
    for (const platform of ['reel', 'tiktok'] as const) {
      for (const t of planAutoEdit(platform, bounds, { name: 'A', elementCount: 10, storeyCount: 2, healthScore: 80 }).texts) {
        expect(t.anchor.startsWith('bottom'), `${platform}: ${t.text}`).toBe(false)
      }
    }
  })

  it('localises captions', () => {
    const es = planAutoEdit('reel', bounds, { name: 'A', elementCount: 1200, storeyCount: 3 }, 'es')
    expect(es.texts.some((t) => t.text.includes('plantas'))).toBe(true)
  })

  it('opens with the model name as the hook', () => {
    const plan = planAutoEdit('tiktok', bounds, { name: '  Torre Poblenou ' })
    expect(plan.texts[0]).toMatchObject({ text: 'Torre Poblenou', startSec: 0 })
  })

  it('every platform spec renders at a standard social resolution', () => {
    for (const p of PLATFORMS) {
      const s = PLATFORM_SPECS[p]
      expect(s.width).toBe(1080)
      expect(s.width / s.height).toBeCloseTo(s.ratio)
    }
  })
})
