import { describe, expect, it } from 'vitest'
import { addSource, createProject, layoutClips, type EditProject, type MediaSource } from './project'
import { applyTemplate, makeLoop, type TemplateContext } from './viral-templates'

function project(lengths: number[]): EditProject {
  let p = createProject()
  lengths.forEach((len, i) => {
    const s: MediaSource = { id: `s${i}`, kind: 'shot', label: '', durationSec: len, width: 1080, height: 1920 }
    p = addSource(p, s)
  })
  return { ...p, clips: p.clips.map((c, i) => ({ ...c, transition: i ? 'whip' : 'cut', transitionSec: 0.25 })), intro: { type: 'black', sec: 0.4 }, outro: { type: 'black', sec: 0.4 } }
}

const ctx: TemplateContext = {
  rhythm: { beatSec: 0.5, beatsPerBar: 4, offsetSec: 0 },
  dropAt: null,
  labels: { waitForIt: 'Wait', before: 'Before', after: 'After', pov: 'POV', facts: ['12 storeys', '4,000 elements'], factsTitle: '2 facts' },
}

describe('makeLoop', () => {
  it('moves the head of the first clip to the end, continuous into the opening frame', () => {
    const p = project([6, 4, 4])
    const looped = makeLoop(p, ctx.rhythm)
    expect(looped.clips).toHaveLength(4)
    const opener = looped.clips[0], tail = looped.clips[3]
    expect(opener.sourceId).toBe('s0')
    expect(tail.sourceId).toBe('s0')
    // Tail ends exactly where the opener starts: no seam on replay.
    expect(tail.outSec).toBeCloseTo(opener.inSec)
    expect(tail.inSec).toBe(0)
    expect(tail.outSec).toBeCloseTo(2) // one bar at 120 BPM
    expect(opener.transition).toBe('cut')
    expect(tail.transition).toBe('whip')
    expect(looped.intro.type).toBe('none')
    expect(looped.outro.type).toBe('none')
  })

  it('leaves a single clip alone', () => {
    const p = project([6])
    expect(makeLoop(p, null)).toBe(p)
  })
})

describe('applyTemplate', () => {
  it('drop reveal puts the longest shot second and hooks until it', () => {
    const p = applyTemplate(project([3, 8, 3, 3]), 'dropReveal', ctx)
    expect(p.clips[1].sourceId).toBe('s1')
    const reveal = layoutClips(p)[1].start
    expect(p.texts[0].text).toBe('Wait')
    expect(p.texts[0].endSec).toBeCloseTo(reveal)
  })

  it('before/after flashes white at the middle and labels both halves', () => {
    const p = applyTemplate(project([3, 3, 3, 3]), 'beforeAfter', ctx)
    expect(p.clips[2].transition).toBe('dipWhite')
    expect(p.texts.map((x) => x.text)).toEqual(['Before', 'After'])
  })

  it('facts only uses the facts it has', () => {
    const p = applyTemplate(project([3, 3, 3]), 'facts', ctx)
    expect(p.texts.map((x) => x.text)).toEqual(['2 facts', '1/2 · 12 storeys', '2/2 · 4,000 elements'])
  })
})
